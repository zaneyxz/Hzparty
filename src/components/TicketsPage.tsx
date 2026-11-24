import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Ticket,
} from 'lucide-react';
import type {
  EventEdition,
  PageRoute,
  PixPaymentCreationResult,
  TicketBatch,
  TicketReservation,
} from '../types/hz';
import {
  calculateOrderSummary,
  formatBRL,
  formatWhatsAppInput,
  generateVisualCode,
  isValidWhatsApp,
} from '../utils/ticketing';
import {
  checkMercadoPagoPaymentStatus,
  createMercadoPagoPix,
  fetchMercadoPagoConfig,
} from '../services/paymentsApi';
import { saveTicketOrder } from '../services/hzStore';
import { QrCodeSvg } from './QrCodeSvg';

interface TicketsPageProps {
  event: EventEdition;
  batches: TicketBatch[];
  onCreateReservation: (reservation: TicketReservation) => void;
  onUpdateReservationStatus: (ticketCode: string, status: TicketReservation['status']) => void;
  onNavigate: (page: PageRoute) => void;
}

export function TicketsPage({
  event,
  batches,
  onCreateReservation,
  onUpdateReservationStatus,
  onNavigate,
}: TicketsPageProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [holderName, setHolderName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [mpConfigured, setMpConfigured] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [pixCheckout, setPixCheckout] = useState<{
    reservation: TicketReservation;
    payment: PixPaymentCreationResult;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMercadoPagoConfig()
      .then((cfg) => {
        if (active) setMpConfigured(cfg.configured);
      })
      .catch(() => {
        if (active) setMpConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Poll Mercado Pago status every 6 seconds while awaiting payment
  useEffect(() => {
    if (
      !pixCheckout ||
      pixCheckout.reservation.status !== 'aguardando-pagamento' ||
      !pixCheckout.payment.paymentId
    ) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const res = await checkMercadoPagoPaymentStatus(pixCheckout.payment.paymentId);
        if (res.normalizedStatus === 'pago') {
          setPixCheckout((prev) =>
            prev
              ? {
                  ...prev,
                  reservation: { ...prev.reservation, status: 'pago' },
                  payment: { ...prev.payment, status: res.status },
                }
              : null
          );
          onUpdateReservationStatus(pixCheckout.reservation.ticketCode, 'pago');
        }
      } catch {
        // Silent background poll retry
      }
    }, 6000);

    return () => window.clearInterval(interval);
  }, [pixCheckout, onUpdateReservationStatus]);

  const summary = useMemo(
    () => calculateOrderSummary(batches, quantities),
    [batches, quantities]
  );

  const adjustQuantity = (batch: TicketBatch, delta: number) => {
    setQuantities((prev) => {
      const current = prev[batch.id] ?? 0;
      const next = Math.max(0, Math.min(batch.maxPerOrder, current + delta));
      return { ...prev, [batch.id]: next };
    });
    setPixCheckout(null);
  };

  const handleGeneratePix = async (e: FormEvent) => {
    e.preventDefault();
    if (summary.totalQuantity === 0) {
      setFormError('Selecione ao menos 1 ingresso para gerar o Pix.');
      return;
    }
    const cleanName = holderName.trim();
    if (cleanName.length < 3) {
      setFormError('Informe o nome completo do titular do ingresso.');
      return;
    }
    if (!isValidWhatsApp(whatsapp)) {
      setFormError('Informe um WhatsApp válido com DDD.');
      return;
    }

    setFormError(null);
    setIsGenerating(true);

    try {
      const seed = `${cleanName}-${whatsapp}-${summary.totalCents}-${Date.now()}-${Math.random()}`;
      const ticketCode = generateVisualCode('HZ', seed);
      const items = summary.lines.map((line) => ({
        id: line.batchId,
        quantity: line.quantity,
      }));

      const payment = await createMercadoPagoPix({
        holderName: cleanName,
        whatsapp,
        ticketCode,
        items,
      });

      const reservation = await saveTicketOrder({
        ticketCode,
        holderName: cleanName,
        whatsapp,
        event,
        tierName: payment.tierSummary,
        quantity: payment.totalQuantity,
        totalCents: payment.totalCents,
        mpPaymentId: payment.paymentId,
      });

      onCreateReservation(reservation);
      setPixCheckout({ reservation, payment });
      setCopiedPix(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível gerar o Pix no Mercado Pago.';
      setFormError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleManualCheckPayment = async () => {
    if (!pixCheckout?.payment.paymentId) return;
    setIsCheckingPayment(true);
    setFormError(null);
    try {
      const res = await checkMercadoPagoPaymentStatus(pixCheckout.payment.paymentId);
      if (res.normalizedStatus === 'pago') {
        setPixCheckout((prev) =>
          prev
            ? {
                ...prev,
                reservation: { ...prev.reservation, status: 'pago' },
                payment: { ...prev.payment, status: res.status },
              }
            : null
        );
        onUpdateReservationStatus(pixCheckout.reservation.ticketCode, 'pago');
      } else {
        setFormError(
          `Status atual no Mercado Pago: ${res.status}. Assim que o Pix compensar, atualize aqui.`
        );
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Erro ao verificar pagamento no Mercado Pago.'
      );
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixCheckout?.payment.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixCheckout.payment.qrCode);
      setCopiedPix(true);
      window.setTimeout(() => setCopiedPix(false), 2200);
    } catch {
      setCopiedPix(true);
    }
  };

  const hasSelection = summary.totalQuantity > 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="border-b border-white/10 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
          {event.dateLabel} · {event.timeRange}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-white uppercase sm:text-5xl">
          Ingressos HZ PARTY
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[#9CA3AF] sm:text-base">
          Ingresso único à venda com valores para Mulher (R$ 15,00) e Homem (R$ 20,00).
          Pagamento via Pix processado diretamente na sua conta do Mercado Pago.
        </p>
      </div>

      {mpConfigured === false && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-100 sm:text-sm"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div>
            <p className="font-semibold text-white">
              Chave do Mercado Pago ainda não configurada no servidor
            </p>
            <p className="mt-1 text-amber-200/90">
              Para gerar cobranças Pix reais que caem direto na sua conta, adicione o
              Access Token do Mercado Pago na variável secreta{' '}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-white">
                MERCADO_PAGO_ACCESS_TOKEN
              </code>{' '}
              no painel de Segredos (Secrets).
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Single Ticket Card with Mulher R$ 15 and Homem R$ 20 */}
        <div className="lg:col-span-7">
          <article
            className={`rounded-xl border p-6 transition-colors sm:p-8 ${
              hasSelection
                ? 'border-[#DC143C]/60 bg-[#100D11]'
                : 'border-white/10 bg-[#0B0B10]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] text-[#E11D38] uppercase">
                  Ingresso Oficial · Disponível
                </p>
                <h2 className="mt-1 font-display text-3xl font-bold text-white uppercase">
                  Ingresso HZ PARTY
                </h2>
                <p className="mt-1 text-sm text-[#9CA3AF]">
                  {event.venue} · {event.dateLabel} · {event.timeRange}
                </p>
                <p className="mt-0.5 text-xs text-[#8D93A1]">
                  Rua Luiz Ferrari, 776, em Londrina (região do Heimtal / Jardim Leblon)
                </p>
              </div>
              <Ticket className="h-6 w-6 text-[#E11D38]" aria-hidden="true" />
            </div>

            <div className="mt-6 divide-y divide-white/10">
              {batches.map((batch) => {
                const qty = quantities[batch.id] ?? 0;
                return (
                  <div
                    key={batch.id}
                    className="flex flex-col justify-between gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div>
                      <h3 className="font-display text-2xl font-bold text-white uppercase">
                        {batch.batchLabel}
                      </h3>
                      <p className="mt-0.5 text-xs text-[#9CA3AF]">
                        {batch.tierLabel}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-6 sm:justify-end">
                      <p className="font-mono text-2xl font-bold text-white tabular-nums">
                        {formatBRL(batch.priceCents)}
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(batch, -1)}
                          disabled={qty === 0}
                          aria-label={`Diminuir quantidade de ${batch.name}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-[#050507] text-white transition-colors hover:border-[#E11D38] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span
                          data-testid={`qty-${batch.id}`}
                          className="w-8 text-center font-mono text-base font-bold text-white tabular-nums"
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(batch, 1)}
                          disabled={qty >= batch.maxPerOrder}
                          aria-label={`Aumentar quantidade de ${batch.name}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-[#050507] text-white transition-colors hover:border-[#E11D38] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="mt-6 space-y-2 border-t border-white/10 pt-5 text-xs text-[#B4B9C4]">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-[#E11D38]" aria-hidden="true" />
                <span>Som de alta qualidade e DJs qualificados com carro de som</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-[#E11D38]" aria-hidden="true" />
                <span>Segurança presente até o final da festa (05:00)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-[#E11D38]" aria-hidden="true" />
                <span>Venda de bebidas somente para +18 · Ingresso digital com QR Code</span>
              </li>
            </ul>
          </article>
        </div>

        {/* Order Summary & Live Mercado Pago Pix Interface */}
        <aside className="lg:col-span-5">
          <div className="sticky top-20 rounded-xl border border-white/12 bg-[#0B0B10] p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="font-display text-2xl font-bold text-white uppercase">
                Resumo da Compra
              </h2>
              <Ticket className="h-5 w-5 text-[#E11D38]" aria-hidden="true" />
            </div>

            {summary.lines.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#9CA3AF]">
                  Nenhum ingresso selecionado no momento.
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Use os botões + e − ao lado de Mulher (R$ 15,00) ou Homem (R$ 20,00).
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3 border-b border-white/10 pb-5 text-sm">
                {summary.lines.map((line) => (
                  <div
                    key={line.batchId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-[#D1D5DB]">
                      <span className="font-mono font-semibold text-white tabular-nums">
                        {line.quantity}x
                      </span>{' '}
                      {line.name}
                    </span>
                    <span className="font-mono font-semibold text-white tabular-nums">
                      {formatBRL(line.lineTotalCents)}
                    </span>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2 text-xs text-[#9CA3AF]">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatBRL(summary.subtotalCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                  <span>Taxa de plataforma (10%)</span>
                  <span className="font-mono tabular-nums">
                    {formatBRL(summary.serviceFeeCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-3 text-base font-bold text-white">
                  <span>Total</span>
                  <span
                    data-testid="order-total"
                    className="font-mono text-xl text-[#E11D38] tabular-nums"
                  >
                    {formatBRL(summary.totalCents)}
                  </span>
                </div>
              </div>
            )}

            {!pixCheckout ? (
              <form onSubmit={handleGeneratePix} noValidate className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="ticket-holder"
                    className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
                  >
                    Nome Completo do Titular
                  </label>
                  <input
                    id="ticket-holder"
                    type="text"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="Nome impresso no ingresso"
                    className="mt-1.5 block min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 text-sm text-white placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ticket-whatsapp"
                    className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
                  >
                    WhatsApp de Contato
                  </label>
                  <input
                    id="ticket-whatsapp"
                    type="tel"
                    inputMode="numeric"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatWhatsAppInput(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="mt-1.5 block min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 font-mono text-sm text-white placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
                  />
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-md border border-[#E11D38]/50 bg-[#E11D38]/10 px-3.5 py-2 text-xs font-medium text-[#FDA4AF]"
                  >
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isGenerating}
                  className="hz-crimson-button flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold tracking-[0.08em] text-white uppercase disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isGenerating ? 'Gerando Pix...' : 'Gerar Pix Mercado Pago'}
                </button>
              </form>
            ) : (
              <div
                data-testid="pix-preview-panel"
                className="mt-5 space-y-4 rounded-lg border border-[#DC143C]/40 bg-[#050507] p-4"
              >
                {pixCheckout.reservation.status === 'pago' ? (
                  <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <p>
                      <strong>Pagamento Aprovado!</strong> Seu Pix foi confirmado pelo
                      Mercado Pago. Acesse seu ingresso com QR Code abaixo.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-white/10 bg-[#0B0B10] p-3 text-xs text-[#D1D5DB]">
                    <p className="font-semibold text-white">
                      Pix Mercado Pago gerado · Aguardando pagamento
                    </p>
                    <p className="mt-1 text-[#9CA3AF]">
                      Pague pelo aplicativo do seu banco usando o QR Code ou Copia e
                      Cola abaixo.
                    </p>
                  </div>
                )}

                <div className="flex flex-col items-center py-2 text-center">
                  {pixCheckout.payment.qrCodeBase64 ? (
                    <img
                      src={`data:image/png;base64,${pixCheckout.payment.qrCodeBase64}`}
                      alt="QR Code Pix oficial do Mercado Pago"
                      className="h-44 w-44 rounded-md bg-white p-2"
                    />
                  ) : (
                    <QrCodeSvg
                      value={pixCheckout.payment.qrCode || pixCheckout.reservation.ticketCode}
                      size={168}
                      accentCrimson
                      label="QR Code Pix do Mercado Pago"
                    />
                  )}
                  <p className="mt-3 font-mono text-xs text-[#9CA3AF]">
                    Código do Ingresso:{' '}
                    <span className="font-bold text-white">
                      {pixCheckout.reservation.ticketCode}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#71717A]">
                    Pagamento MP #{pixCheckout.payment.paymentId}
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-[#E11D38] tabular-nums">
                    {formatBRL(pixCheckout.reservation.totalCents)}
                  </p>
                </div>

                {pixCheckout.payment.qrCode && (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-[#9CA3AF] uppercase">
                      Pix Copia e Cola (Mercado Pago)
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        aria-label="Código Pix Copia e Cola"
                        value={pixCheckout.payment.qrCode}
                        className="min-h-[40px] flex-1 truncate rounded-md border border-white/10 bg-[#0D0D11] px-3 font-mono text-xs text-[#D1D5DB]"
                      />
                      <button
                        type="button"
                        onClick={handleCopyPix}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-white/15 bg-[#14141B] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#E11D38]"
                      >
                        {copiedPix ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {formError && (
                  <p
                    role="alert"
                    className="rounded-md border border-[#E11D38]/40 bg-[#E11D38]/10 px-3 py-2 text-xs text-[#FDA4AF]"
                  >
                    {formError}
                  </p>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  {pixCheckout.reservation.status !== 'pago' && (
                    <button
                      type="button"
                      onClick={handleManualCheckPayment}
                      disabled={isCheckingPayment}
                      className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#E11D38]/60 bg-[#E11D38]/12 px-4 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#E11D38]"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isCheckingPayment ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      {isCheckingPayment ? 'Verificando...' : 'Verificar Pagamento'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onNavigate('meu-ingresso')}
                    className="hz-crimson-button flex min-h-[44px] w-full items-center justify-center rounded-md px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase"
                  >
                    Abrir em Meu Ingresso
                  </button>
                  <button
                    type="button"
                    onClick={() => setPixCheckout(null)}
                    className="flex min-h-[40px] w-full items-center justify-center rounded-md border border-white/15 bg-transparent px-4 py-2 text-xs font-semibold text-[#C7CBD4] transition-colors hover:text-white"
                  >
                    Novo Pedido
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
