import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  History,
  Keyboard,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Ticket,
  User,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import type { TicketReservation } from '../types/hz';
import {
  shouldSkipDuplicateScan,
  type TicketScanResult,
} from '../utils/qrScanner';

interface TicketScannerPanelProps {
  reservations: TicketReservation[];
  onScanAndValidate: (rawQrPayload: string) => Promise<TicketScanResult>;
}

type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function playFeedbackTone(kind: 'valid' | 'alert') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (kind === 'valid') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.29);
      setTimeout(() => void ctx.close(), 400);
    } else {
      for (const offset of [0, 0.16]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now + offset);
        gain.gain.setValueAtTime(0.06, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.13);
      }
      setTimeout(() => void ctx.close(), 500);
    }
  } catch {
    // Ignore audio errors on restricted devices
  }
}

function getCameraErrorMessage(err: unknown): string {
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    return 'O acesso à câmera exige conexão segura (HTTPS). Abra o site publicado pela Netlify via HTTPS.';
  }
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Permissão de câmera negada. Autorize o uso da câmera nas configurações do navegador e clique em Iniciar Scanner novamente.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'Nenhuma câmera foi detectada neste dispositivo. Você ainda pode validar ingressos pelo código manual abaixo.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'A câmera está sendo usada por outro aplicativo. Feche o outro app e tente novamente.';
    }
  }
  return 'Não foi possível iniciar a câmera neste dispositivo. Verifique as permissões ou use a validação manual abaixo.';
}

export function TicketScannerPanel({
  reservations,
  onScanAndValidate,
}: TicketScannerPanelProps) {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [latestResult, setLatestResult] = useState<TicketScanResult | null>(null);
  const [sessionHistory, setSessionHistory] = useState<TicketScanResult[]>([]);
  const [manualCode, setManualCode] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const isValidatingRef = useRef(false);
  const lastScanRef = useRef<{ raw: string; atMs: number } | null>(null);
  const lastFrameCheckRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Real-time event validation counters directly from Firestore reservations
  const eventStats = useMemo(() => {
    const validatedTickets = reservations.filter((r) => r.status === 'validado');
    const validatedPeople = validatedTickets.reduce((sum, r) => sum + r.quantity, 0);
    const totalPaidOrValidated = reservations.filter(
      (r) => r.status === 'pago' || r.status === 'validado'
    ).length;
    return {
      validatedCount: validatedTickets.length,
      validatedPeople,
      totalPaidOrValidated,
      validatedTickets,
    };
  }, [reservations]);

  // Unified recent validations history (live session scans + Firestore validated passes)
  const recentValidations = useMemo(() => {
    const items: Array<{
      id: string;
      outcome: TicketScanResult['outcome'];
      holderName: string;
      ticketCode: string;
      tierName?: string;
      timestamp: string;
      subtitle: string;
    }> = [];

    const seenValidatedCodes = new Set<string>();

    for (const entry of sessionHistory) {
      if (entry.outcome === 'valid' && entry.ticketCode) {
        seenValidatedCodes.add(entry.ticketCode);
      }
      items.push({
        id: entry.id,
        outcome: entry.outcome,
        holderName:
          entry.ticket?.holderName ||
          (entry.outcome === 'invalid' ? 'QR Code Não Reconhecido' : 'Titular'),
        ticketCode: entry.ticketCode || entry.rawInput.slice(0, 24) || '—',
        tierName: entry.ticket?.tierName,
        timestamp: entry.validatedAt || entry.scannedAt,
        subtitle:
          entry.outcome === 'valid'
            ? 'Validado agora'
            : entry.outcome === 'already-used'
              ? `Tentativa duplicada · 1º uso: ${entry.validatedAt || 'anterior'}`
              : entry.outcome === 'unpaid'
                ? 'Pagamento Pix pendente'
                : 'QR Code inválido',
      });
    }

    for (const ticket of eventStats.validatedTickets) {
      if (seenValidatedCodes.has(ticket.ticketCode)) continue;
      items.push({
        id: `fs_${ticket.ticketCode}`,
        outcome: 'valid',
        holderName: ticket.holderName,
        ticketCode: ticket.ticketCode,
        tierName: ticket.tierName,
        timestamp: ticket.validatedAt || ticket.createdAt,
        subtitle: 'Validado no evento (Firebase)',
      });
    }

    return items.slice(0, 20);
  }, [sessionHistory, eventStats.validatedTickets]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('idle');
  }, []);

  // Always release the camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const processQrValue = useCallback(
    async (rawValue: string, fromCamera: boolean) => {
      const cleaned = rawValue.trim();
      if (!cleaned || isValidatingRef.current) return;

      const now = Date.now();
      if (fromCamera && shouldSkipDuplicateScan(lastScanRef.current, cleaned, now, 3500)) {
        return;
      }

      lastScanRef.current = { raw: cleaned, atMs: now };
      isValidatingRef.current = true;
      setIsValidating(true);

      try {
        const result = await onScanAndValidate(cleaned);
        setLatestResult(result);
        setSessionHistory((prev) => [result, ...prev].slice(0, 30));

        if (soundEnabledRef.current) {
          playFeedbackTone(result.outcome === 'valid' ? 'valid' : 'alert');
        }
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(result.outcome === 'valid' ? 120 : [120, 80, 180]);
        }
      } finally {
        isValidatingRef.current = false;
        setIsValidating(false);
      }
    },
    [onScanAndValidate]
  );

  const scanFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !streamRef.current) {
      return;
    }

    const now = performance.now();
    // Throttle decoding to ~8 fps for fast detection without overheating mobile devices
    if (
      !isValidatingRef.current &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      now - lastFrameCheckRef.current >= 125
    ) {
      lastFrameCheckRef.current = now;

      const runDecode = async () => {
        // Fast native path when BarcodeDetector supports QR codes
        if (detectorRef.current) {
          try {
            const barcodes = await detectorRef.current.detect(video);
            const firstValue = barcodes.find((b) => b.rawValue)?.rawValue;
            if (firstValue) {
              void processQrValue(firstValue, true);
              return;
            }
          } catch {
            // Fall through to jsQR
          }
        }

        // Universal jsQR path (works on iOS Safari, Firefox, Chrome, Desktop)
        const targetWidth = Math.min(video.videoWidth, 640);
        const scale = targetWidth / video.videoWidth;
        const targetHeight = Math.round(video.videoHeight * scale);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code?.data) {
          void processQrValue(code.data, true);
        }
      };

      void runDecode();
    }

    rafRef.current = requestAnimationFrame(scanFrameLoop);
  }, [processQrValue]);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setCameraError(null);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setCameraStatus('error');
        setCameraError(
          'Este navegador não oferece suporte à captura de câmera ou o acesso não está em HTTPS. Use a validação manual abaixo.'
        );
        return;
      }

      setCameraStatus('requesting');

      try {
        // Initialize native BarcodeDetector if available
        if (typeof window.BarcodeDetector === 'function') {
          try {
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
          } catch {
            detectorRef.current = null;
          }
        } else {
          detectorRef.current = null;
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: requestedFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback for desktop webcams that reject facingMode constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
        }

        setCameraStatus('active');
        lastScanRef.current = null;
        rafRef.current = requestAnimationFrame(scanFrameLoop);
      } catch (err) {
        stopCamera();
        setCameraStatus('error');
        setCameraError(getCameraErrorMessage(err));
      }
    },
    [facingMode, scanFrameLoop, stopCamera]
  );

  const handleToggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraStatus === 'active') {
      void startCamera(next);
    }
  };

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.trim();
    if (!cleaned) return;
    await processQrValue(cleaned, false);
    setManualCode('');
  };

  const handleReadyForNextScan = () => {
    lastScanRef.current = null;
    setLatestResult(null);
  };

  const frameBorderTone =
    latestResult?.outcome === 'valid'
      ? 'border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.35)]'
      : latestResult && latestResult.outcome !== 'error'
        ? 'border-[#E11D38] shadow-[0_0_30px_rgba(225,29,56,0.4)]'
        : 'border-[#E11D38]/85';

  return (
    <div className="mt-8 space-y-6">
      {/* Top Operational Counter & Camera Status Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Ingressos Validados no Evento</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </div>
          <p
            data-testid="scanner-validated-counter"
            className="mt-2 font-mono text-3xl font-bold text-white tabular-nums"
          >
            {eventStats.validatedCount}
          </p>
          <p className="mt-1 text-xs text-[#71717A] tabular-nums">
            {eventStats.validatedPeople} entrada(s) liberada(s) ·{' '}
            {eventStats.totalPaidOrValidated} passe(s) pagos/validados
          </p>
        </div>

        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Status da Câmera</span>
            {cameraStatus === 'active' ? (
              <Camera className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            ) : (
              <CameraOff className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5">
            <span
              data-testid="camera-status-indicator"
              className={`h-2.5 w-2.5 rounded-full ${
                cameraStatus === 'active'
                  ? 'animate-pulse bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                  : cameraStatus === 'requesting'
                    ? 'animate-pulse bg-amber-400'
                    : cameraStatus === 'error'
                      ? 'bg-[#E11D38]'
                      : 'bg-[#52525B]'
              }`}
              aria-hidden="true"
            />
            <p className="font-display text-xl font-bold text-white uppercase">
              {cameraStatus === 'active'
                ? 'Câmera Ativa'
                : cameraStatus === 'requesting'
                  ? 'Solicitando Permissão'
                  : cameraStatus === 'error'
                    ? 'Acesso Indisponível'
                    : 'Câmera Parada'}
            </p>
          </div>
          <p className="mt-1 text-xs text-[#71717A]">
            {cameraStatus === 'active'
              ? `Leitura em tempo real (${facingMode === 'environment' ? 'Traseira' : 'Frontal'})`
              : 'Clique em Iniciar Scanner para liberar a câmera'}
          </p>
        </div>

        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Segurança Firebase</span>
            <ShieldCheck className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-xl font-bold text-white uppercase">
            Validação Atômica
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Consulta em tempo real com bloqueio contra uso duplicado
          </p>
        </div>
      </div>

      {/* Main Scanner + Live Validation Result Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Camera Viewport + Controls + Manual Fallback */}
        <div className="hz-card-surface rounded-xl p-5 sm:p-6 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-white uppercase">
                Scanner de Ingressos
              </h2>
              <p className="mt-0.5 text-xs text-[#9CA3AF]">
                Aponte a câmera para o QR Code exibido em Meu Ingresso.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              aria-label={soundEnabled ? 'Silenciar alerta sonoro' : 'Ativar alerta sonoro'}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-white/15 bg-[#050507] px-3 py-1.5 text-xs font-semibold text-[#D1D5DB] transition-colors hover:border-white/30 hover:text-white"
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  Som On
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-[#71717A]" aria-hidden="true" />
                  Som Off
                </>
              )}
            </button>
          </div>

          {/* Video Stage */}
          <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/15 bg-[#040406]">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${
                cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

            {/* Active Viewfinder Reticle Overlay */}
            {cameraStatus === 'active' && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-black/75 px-2.5 py-1 text-[11px] font-bold tracking-wider text-emerald-300 uppercase backdrop-blur-sm">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  Câmera Ativa
                </div>

                {isValidating && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E11D38]" />
                    Consultando Firebase...
                  </div>
                )}

                <div
                  className={`relative h-48 w-48 rounded-xl border-2 transition-all duration-200 sm:h-56 sm:w-56 ${frameBorderTone}`}
                >
                  <span className="absolute -top-0.5 -left-0.5 h-6 w-6 rounded-tl-lg border-t-4 border-l-4 border-white" />
                  <span className="absolute -top-0.5 -right-0.5 h-6 w-6 rounded-tr-lg border-t-4 border-r-4 border-white" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-lg border-b-4 border-l-4 border-white" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-lg border-b-4 border-r-4 border-white" />
                </div>

                <p className="mt-3 rounded bg-black/70 px-3 py-1 text-[11px] font-medium text-[#E2E4E9]">
                  Enquadre o QR Code do ingresso dentro da área
                </p>
              </div>
            )}

            {/* Idle / Requesting / Error Placeholder */}
            {cameraStatus !== 'active' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                {cameraStatus === 'requesting' ? (
                  <>
                    <Loader2
                      className="h-10 w-10 animate-spin text-[#E11D38]"
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-sm font-semibold text-white">
                      Solicitando acesso à câmera...
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-[#9CA3AF]">
                      Aceite a permissão exibida pelo navegador para iniciar a leitura.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#DC143C]/40 bg-[#DC143C]/12 text-[#E11D38]">
                      <ScanLine className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">
                      Scanner pronto para uso na portaria
                    </p>
                    <p className="mt-1 max-w-xs text-xs text-[#9CA3AF]">
                      Toque em <strong>Iniciar Scanner</strong> para ativar a câmera do
                      celular ou computador.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {cameraError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#E11D38]/45 bg-[#E11D38]/12 px-3.5 py-3 text-xs leading-relaxed text-[#FDA4AF]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Primary Scanner Controls */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void startCamera(facingMode)}
              disabled={cameraStatus === 'active' || cameraStatus === 'requesting'}
              className="hz-crimson-button inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-xs font-bold tracking-[0.08em] text-white uppercase disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Iniciar Scanner
            </button>

            <button
              type="button"
              onClick={stopCamera}
              disabled={cameraStatus !== 'active' && cameraStatus !== 'requesting'}
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-md border border-white/20 bg-[#0D0D11] px-5 py-2.5 text-xs font-bold tracking-[0.08em] text-white uppercase transition-colors hover:border-[#E11D38] hover:bg-[#16161E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CameraOff className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              Parar Scanner
            </button>

            {cameraStatus === 'active' && (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                aria-label="Alternar entre câmera traseira e frontal"
                className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#050507] px-3.5 py-2.5 text-xs font-semibold text-[#D1D5DB] transition-colors hover:border-white/35 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Inverter
              </button>
            )}
          </div>

          {/* Manual Ticket Code Fallback (uses the exact same atomic Firebase validation) */}
          <form
            onSubmit={handleManualSubmit}
            className="mt-5 border-t border-white/10 pt-4"
          >
            <label
              htmlFor="scanner-manual-input"
              className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-[#9CA3AF] uppercase"
            >
              <Keyboard className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
              Contingência Manual (Código ou QR)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="scanner-manual-input"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ex.: HZ-AB12CD ou HZPARTY|HZ-AB12CD|..."
                className="min-h-[44px] flex-1 rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 font-mono text-xs text-white uppercase placeholder:normal-case placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isValidating || !manualCode.trim()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[#E11D38]/60 bg-[#E11D38]/15 px-4 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#E11D38] disabled:opacity-45 whitespace-nowrap shrink-0"
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  'Validar'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Instant Visual Validation Result */}
        <div className="hz-card-surface flex flex-col justify-between rounded-xl p-5 sm:p-6 lg:col-span-6">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-2xl font-bold text-white uppercase">
                Resultado da Leitura
              </h2>
              {latestResult && (
                <button
                  type="button"
                  onClick={handleReadyForNextScan}
                  className="text-xs font-semibold text-[#9CA3AF] transition-colors hover:text-white"
                >
                  Limpar tela
                </button>
              )}
            </div>

            {isValidating ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center py-10 text-center">
                <Loader2
                  className="h-10 w-10 animate-spin text-[#E11D38]"
                  aria-hidden="true"
                />
                <p className="mt-4 font-display text-xl font-bold text-white uppercase">
                  Validando no Firebase...
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Verificando autenticidade e registrando operação atômica.
                </p>
              </div>
            ) : !latestResult ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center py-10 text-center">
                <ScanLine className="h-12 w-12 text-[#52525B]" aria-hidden="true" />
                <p className="mt-4 text-sm font-semibold text-white">
                  Aguardando leitura de QR Code
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#9CA3AF]">
                  Ao apontar a câmera para um ingresso válido, o sistema confirma em
                  verde, exibe o nome do participante e marca automaticamente como{' '}
                  <strong className="text-white">UTILIZADO</strong>.
                </p>
              </div>
            ) : latestResult.outcome === 'valid' && latestResult.ticket ? (
              /* INGRESSO VÁLIDO — GREEN CONFIRMATION */
              <div
                data-testid="scanner-result-valid"
                role="status"
                aria-live="assertive"
                className="mt-5 rounded-xl border-2 border-emerald-500 bg-emerald-500/15 p-6 shadow-[0_0_40px_rgba(16,185,129,0.18)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-emerald-300 uppercase">
                      Entrada Liberada
                    </p>
                    <h3 className="font-display text-3xl font-extrabold text-white uppercase">
                      Ingresso Válido
                    </h3>
                  </div>
                </div>

                <dl className="mt-5 space-y-3 border-t border-emerald-500/30 pt-4 text-sm">
                  <div className="flex items-start gap-2.5">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wider text-emerald-200/80 uppercase">
                        Participante
                      </dt>
                      <dd className="text-lg font-bold text-white">
                        {latestResult.ticket.holderName}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wider text-emerald-200/80 uppercase">
                        Identificação do Ingresso
                      </dt>
                      <dd className="font-mono text-sm font-bold text-white">
                        {latestResult.ticket.ticketCode}{' '}
                        <span className="font-sans font-normal text-emerald-100">
                          · {latestResult.ticket.tierName} ({latestResult.ticket.quantity}x)
                        </span>
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <div>
                      <dt className="text-[11px] font-semibold tracking-wider text-emerald-200/80 uppercase">
                        Horário da Validação
                      </dt>
                      <dd className="font-mono text-sm font-semibold text-white tabular-nums">
                        {latestResult.validatedAt || latestResult.scannedAt}
                      </dd>
                    </div>
                  </div>
                </dl>

                <div className="mt-5 rounded-md border border-emerald-500/35 bg-emerald-950/50 px-3.5 py-2.5 text-xs font-semibold text-emerald-200">
                  Status atualizado automaticamente para UTILIZADO no Firebase.
                  {latestResult.syncedFromMp
                    ? ' Pagamento confirmado em tempo real via Mercado Pago.'
                    : ''}
                </div>
              </div>
            ) : latestResult.outcome === 'already-used' && latestResult.ticket ? (
              /* INGRESSO JÁ UTILIZADO — RED ALERT */
              <div
                data-testid="scanner-result-used"
                role="alert"
                aria-live="assertive"
                className="mt-5 rounded-xl border-2 border-[#E11D38] bg-[#E11D38]/18 p-6 shadow-[0_0_40px_rgba(225,29,56,0.22)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E11D38]/25 text-[#FDA4AF]">
                    <AlertTriangle className="h-7 w-7 text-[#E11D38]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-[#FDA4AF] uppercase">
                      Entrada Bloqueada
                    </p>
                    <h3 className="font-display text-3xl font-extrabold text-white uppercase">
                      Ingresso Já Utilizado
                    </h3>
                  </div>
                </div>

                <p className="mt-4 rounded-md border border-[#E11D38]/40 bg-black/40 px-3.5 py-2.5 text-xs font-semibold text-[#FECDD3]">
                  Atenção: este ingresso já foi validado anteriormente. Segunda validação
                  impedida pelo servidor.
                </p>

                <dl className="mt-4 space-y-3 border-t border-[#E11D38]/30 pt-4 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold tracking-wider text-[#FDA4AF] uppercase">
                      Participante
                    </dt>
                    <dd className="text-base font-bold text-white">
                      {latestResult.ticket.holderName}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold tracking-wider text-[#FDA4AF] uppercase">
                      Identificação do Ingresso
                    </dt>
                    <dd className="font-mono text-sm font-bold text-white">
                      {latestResult.ticket.ticketCode} · {latestResult.ticket.tierName}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[11px] font-semibold tracking-wider text-[#FDA4AF] uppercase">
                      Data e Horário da Primeira Utilização
                    </dt>
                    <dd className="font-mono text-sm font-bold text-[#FECDD3] tabular-nums">
                      {latestResult.validatedAt || 'Registrado anteriormente'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : latestResult.outcome === 'unpaid' && latestResult.ticket ? (
              /* PAGAMENTO PENDENTE — RED ALERT */
              <div
                data-testid="scanner-result-unpaid"
                role="alert"
                aria-live="assertive"
                className="mt-5 rounded-xl border-2 border-[#E11D38] bg-[#E11D38]/15 p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E11D38]/25 text-[#E11D38]">
                    <XCircle className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-[#FDA4AF] uppercase">
                      Entrada Não Permitida
                    </p>
                    <h3 className="font-display text-3xl font-extrabold text-white uppercase">
                      Pagamento Não Confirmado
                    </h3>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-[#FECDD3]">
                  {latestResult.message}
                </p>

                <div className="mt-4 border-t border-[#E11D38]/30 pt-3 text-xs text-[#E2E4E9]">
                  <p>
                    Titular: <strong>{latestResult.ticket.holderName}</strong>
                  </p>
                  <p className="mt-1 font-mono text-[#FDA4AF]">
                    Código: {latestResult.ticket.ticketCode} · {latestResult.ticket.tierName}
                  </p>
                </div>
              </div>
            ) : (
              /* INGRESSO INVÁLIDO / ERRO — RED ALERT */
              <div
                data-testid="scanner-result-invalid"
                role="alert"
                aria-live="assertive"
                className="mt-5 rounded-xl border-2 border-[#E11D38] bg-[#E11D38]/18 p-6 shadow-[0_0_40px_rgba(225,29,56,0.2)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E11D38]/25 text-[#E11D38]">
                    <XCircle className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-[#FDA4AF] uppercase">
                      Entrada Não Permitida
                    </p>
                    <h3 className="font-display text-3xl font-extrabold text-white uppercase">
                      {latestResult.outcome === 'error'
                        ? 'Erro na Validação'
                        : 'QR Code Inválido'}
                    </h3>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-[#FECDD3]">
                  {latestResult.message}
                </p>

                {latestResult.rawInput && (
                  <p className="mt-4 break-all rounded-md border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-[#9CA3AF]">
                    Leitura: {latestResult.rawInput}
                  </p>
                )}
              </div>
            )}
          </div>

          {latestResult && (
            <button
              type="button"
              onClick={handleReadyForNextScan}
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-[#050507] px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:border-[#E11D38]"
            >
              <ScanLine className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              Pronto para Próxima Leitura
            </button>
          )}
        </div>
      </div>

      {/* Recent Validations History */}
      <div className="hz-card-surface rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold text-white uppercase">
              Histórico das Últimas Validações
            </h2>
          </div>
          <span className="font-mono text-xs text-[#9CA3AF] tabular-nums">
            {recentValidations.length} registro(s) recente(s)
          </span>
        </div>

        {recentValidations.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9CA3AF]">
            Nenhuma leitura registrada ainda. As validações aparecerão aqui em tempo real.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {recentValidations.map((item) => (
              <li
                key={item.id}
                className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  {item.outcome === 'valid' ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : item.outcome === 'already-used' ? (
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {item.holderName}
                    </p>
                    <p className="font-mono text-xs text-[#9CA3AF]">
                      {item.ticketCode}
                      {item.tierName ? ` · ${item.tierName}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-[#71717A]">{item.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pl-7 sm:pl-0">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                      item.outcome === 'valid'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.outcome === 'already-used'
                          ? 'bg-[#E11D38]/20 text-[#FDA4AF]'
                          : 'bg-[#E11D38]/15 text-[#FDA4AF]'
                    }`}
                  >
                    {item.outcome === 'valid'
                      ? 'Válido'
                      : item.outcome === 'already-used'
                        ? 'Já Utilizado'
                        : item.outcome === 'unpaid'
                          ? 'Não Pago'
                          : 'Inválido'}
                  </span>
                  <span className="font-mono text-xs text-[#9CA3AF] tabular-nums whitespace-nowrap">
                    {item.timestamp}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
