import { useEffect, useState, type FormEvent } from 'react';
import {
  Calendar,
  Clock,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { fetchTicketPassByCode } from '../services/hzStore';
import { checkMercadoPagoPaymentStatus } from '../services/paymentsApi';
import type { EventEdition, PageRoute, TicketReservation } from '../types/hz';
import { formatBRL, lookupTicketReservation } from '../utils/ticketing';
import { QrCodeSvg } from './QrCodeSvg';

interface MyTicketPageProps {
  event: EventEdition;
  reservations: TicketReservation[];
  onRememberTicket?: (ticket: TicketReservation) => void;
  onUpdateReservationStatus: (
    ticketCode: string,
    status: TicketReservation['status']
  ) => void;
  onNavigate: (page: PageRoute) => void;
}

export function MyTicketPage({
  event,
  reservations,
  onRememberTicket,
  onUpdateReservationStatus,
  onNavigate,
}: MyTicketPageProps) {
  const [query, setQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<TicketReservation | null>(
    () => reservations[0] ?? null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingMp, setIsCheckingMp] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showingSampleModel, setShowingSampleModel] = useState(false);

  // Sync if a new reservation was generated or validated
  useEffect(() => {
    if (reservations.length === 0) return;
    if (!selectedTicket || showingSampleModel) {
      setSelectedTicket(reservations[0]);
      setShowingSampleModel(false);
      return;
    }
    const updated = reservations.find(
      (r) => r.ticketCode === selectedTicket.ticketCode
    );
    if (updated) {
      setSelectedTicket(updated);
    }
  }, [reservations, selectedTicket, showingSampleModel]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) {
      setSearchError('Digite o código do ingresso (ex.: HZ-AB12CD).');
      return;
    }

    setSearchError(null);

    // Check current session first
    const localMatch = lookupTicketReservation(reservations, clean);
    if (localMatch) {
      setShowingSampleModel(false);
      setSelectedTicket(localMatch);
      return;
    }

    // Lookup directly in Firestore by exact ticket code
    setIsSearching(true);
    try {
      const remotePass = await fetchTicketPassByCode(clean);
      if (!remotePass) {
        setSearchError(
          'Nenhum ingresso encontrado com esse código. Confira o formato HZ-XXXXXX.'
        );
        return;
      }

      // Check live Mercado Pago status if mpPaymentId is attached
      if (remotePass.mpPaymentId && remotePass.status === 'aguardando-pagamento') {
        try {
          const mp = await checkMercadoPagoPaymentStatus(remotePass.mpPaymentId);
          if (mp.normalizedStatus === 'pago') {
            remotePass.status = 'pago';
          }
        } catch {
          // Ignore if Mercado Pago token is not configured yet
        }
      }

      setShowingSampleModel(false);
      setSelectedTicket(remotePass);
      onRememberTicket?.(remotePass);
    } catch {
      setSearchError(
        'Não foi possível consultar o ingresso no servidor. Tente novamente.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleRefreshPayment = async () => {
    if (!selectedTicket?.mpPaymentId) return;
    setIsCheckingMp(true);
    setSearchError(null);
    try {
      const mp = await checkMercadoPagoPaymentStatus(selectedTicket.mpPaymentId);
      if (mp.normalizedStatus === 'pago') {
        const updated: TicketReservation = {
          ...selectedTicket,
          status: 'pago',
        };
        setSelectedTicket(updated);
        onUpdateReservationStatus(selectedTicket.ticketCode, 'pago');
      } else {
        setSearchError(`Status atual no Mercado Pago: ${mp.status}`);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : 'Não foi possível verificar o status no Mercado Pago.'
      );
    } finally {
      setIsCheckingMp(false);
    }
  };

  const handleLoadVisualModel = () => {
    setSearchError(null);
    setShowingSampleModel(true);
    setSelectedTicket({
      id: 'modelo-visual',
      ticketCode: 'HZ-MODELO',
      holderName: 'Visitante Demonstração',
      whatsapp: '(11) 90000-0000',
      eventTitle: event.title,
      eventDate: event.dateLabel,
      eventTime: event.timeRange,
      venue: event.venue,
      tierName: '1x Ingresso Mulher (Modelo Visual)',
      quantity: 1,
      totalCents: 1650,
      mpPaymentId: '',
      createdAt: 'Modelo',
      status: 'aguardando-pagamento',
    });
  };

  const getStatusLabel = (status: TicketReservation['status']) => {
    if (status === 'validado') return 'Check-in Validado';
    if (status === 'pago') return 'Pago · Liberado';
    if (status === 'cancelado') return 'Pagamento Cancelado';
    return 'Aguardando Pagamento Pix';
  };

  const getStatusColor = (status: TicketReservation['status']) => {
    if (status === 'validado' || status === 'pago') return 'text-emerald-400';
    if (status === 'cancelado') return 'text-[#FDA4AF]';
    return 'text-[#E11D38]';
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="border-b border-white/10 pb-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
          Carteira Digital
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-white uppercase sm:text-5xl">
          Meu Ingresso
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[#9CA3AF] sm:text-base">
          Consulte seu passe digital pelo código do ingresso (ex.: HZ-AB12CD) e
          apresente o QR Code na portaria do evento.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Search & Session Tickets */}
        <div className="space-y-6 lg:col-span-5">
          <form
            onSubmit={handleSearch}
            noValidate
            className="rounded-xl border border-white/10 bg-[#0B0B10] p-6"
          >
            <label
              htmlFor="ticket-lookup"
              className="block text-xs font-semibold tracking-[0.12em] text-[#D1D5DB] uppercase"
            >
              Consultar por Código do Ingresso
            </label>
            <div className="mt-2.5 flex gap-2">
              <input
                id="ticket-lookup"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex.: HZ-AB12CD"
                className="min-h-[44px] flex-1 rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 font-mono text-sm text-white uppercase placeholder:normal-case placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSearching}
                aria-label="Buscar ingresso"
                className="hz-crimson-button inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-4 text-sm font-bold text-white"
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>

            {searchError && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-[#E11D38]/40 bg-[#E11D38]/10 px-3 py-2 text-xs text-[#FDA4AF]"
              >
                {searchError}
              </p>
            )}
          </form>

          {reservations.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#0B0B10] p-6">
              <h2 className="text-xs font-semibold tracking-[0.12em] text-[#9CA3AF] uppercase">
                Ingressos desta Sessão ({reservations.length})
              </h2>
              <div className="mt-3 space-y-2">
                {reservations.map((item) => {
                  const isSelected = selectedTicket?.ticketCode === item.ticketCode;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setShowingSampleModel(false);
                        setSearchError(null);
                        setSelectedTicket(item);
                      }}
                      className={`flex min-h-[52px] w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[#E11D38] bg-[#E11D38]/12'
                          : 'border-white/10 bg-[#050507] hover:border-white/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.holderName}
                        </p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {item.ticketCode} · {item.quantity}x
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${getStatusColor(item.status)}`}>
                        {item.status === 'validado'
                          ? 'Validado'
                          : item.status === 'pago'
                            ? 'Pago'
                            : item.status === 'cancelado'
                              ? 'Cancelado'
                              : 'Pendente'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!selectedTicket && (
            <div className="rounded-xl border border-white/10 bg-[#09090D] p-6">
              <p className="text-sm text-[#D1D5DB]">
                Digite seu código acima ou gere um ingresso na página Ingressos.
              </p>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onNavigate('ingressos')}
                  className="hz-crimson-button inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 text-xs font-bold tracking-wider text-white uppercase"
                >
                  Ir para Ingressos
                </button>
                <button
                  type="button"
                  onClick={handleLoadVisualModel}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-white/15 bg-[#121218] px-4 py-2 text-xs font-semibold text-[#E2E4E9] transition-colors hover:border-white/35"
                >
                  Ver Modelo Visual
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Digital Ticket Pass Presentation */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <article
              data-testid="digital-ticket-pass"
              className="overflow-hidden rounded-2xl border border-[#DC143C]/45 bg-[#0B0B10] shadow-[0_0_50px_rgba(220,20,60,0.1)]"
            >
              {/* Pass Top Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#07070A] px-6 py-5">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/aistudio/hz_party_icon_eebb473c.png"
                    alt="HZ PARTY"
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full border border-[#DC143C]/50 object-cover"
                  />
                  <div>
                    <p className="font-display text-2xl font-extrabold tracking-wide text-white uppercase">
                      {selectedTicket.eventTitle}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {showingSampleModel
                        ? 'Modelo de Demonstração Visual (sem valor real)'
                        : 'Ingresso Digital Oficial'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    Status do Passe
                  </p>
                  <p
                    className={`mt-0.5 text-sm font-bold ${getStatusColor(
                      selectedTicket.status
                    )}`}
                  >
                    {getStatusLabel(selectedTicket.status)}
                  </p>
                </div>
              </div>

              {/* Pass Body */}
              <div className="grid grid-cols-1 gap-8 p-6 sm:grid-cols-12 sm:p-8">
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#050507] p-6 sm:col-span-5">
                  {showingSampleModel ||
                  selectedTicket.status === 'pago' ||
                  selectedTicket.status === 'validado' ? (
                    <>
                      <QrCodeSvg
                        value={`HZPARTY|${selectedTicket.ticketCode}|${selectedTicket.holderName}`}
                        size={184}
                        accentCrimson
                        label={`QR Code do ingresso ${selectedTicket.ticketCode}`}
                      />
                      <p className="mt-4 font-mono text-base font-bold tracking-[0.16em] text-white">
                        {selectedTicket.ticketCode}
                      </p>
                      <p className="mt-1 text-center text-[11px] text-[#9CA3AF]">
                        {selectedTicket.status === 'validado'
                          ? 'Check-in já realizado na portaria'
                          : 'Apresente este QR Code na entrada'}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#DC143C]/40 bg-[#DC143C]/12 text-[#E11D38]">
                        <Lock className="h-7 w-7" aria-hidden="true" />
                      </div>
                      <p className="mt-4 font-mono text-base font-bold tracking-[0.16em] text-white">
                        {selectedTicket.ticketCode}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-[#9CA3AF]">
                        QR Code de entrada bloqueado até a confirmação do pagamento Pix no
                        Mercado Pago.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between space-y-5 sm:col-span-7">
                  <dl className="space-y-4">
                    <div>
                      <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                        Titular
                      </dt>
                      <dd className="mt-1 text-lg font-bold text-white">
                        {selectedTicket.holderName}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                        Categoria
                      </dt>
                      <dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#E2E4E9]">
                        <Ticket className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
                        {selectedTicket.tierName}
                      </dd>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                      <div>
                        <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                          Data
                        </dt>
                        <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
                          <Calendar className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          {selectedTicket.eventDate}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                          Horário
                        </dt>
                        <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-white tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          {selectedTicket.eventTime}
                        </dd>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                          Local
                        </dt>
                        <dd className="mt-1 flex items-center gap-1.5 text-sm text-[#D1D5DB]">
                          <MapPin className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          {selectedTicket.venue}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                          Valor
                        </dt>
                        <dd className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
                          {formatBRL(selectedTicket.totalCents)}
                        </dd>
                      </div>
                    </div>
                  </dl>

                  {selectedTicket.mpPaymentId &&
                    selectedTicket.status === 'aguardando-pagamento' && (
                      <button
                        type="button"
                        onClick={handleRefreshPayment}
                        disabled={isCheckingMp}
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-[#E11D38]/50 bg-[#E11D38]/10 px-4 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#E11D38]"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isCheckingMp ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        {isCheckingMp
                          ? 'Consultando Mercado Pago...'
                          : 'Verificar Pagamento no Mercado Pago'}
                      </button>
                    )}

                  <div className="flex items-center gap-2.5 border-t border-white/10 pt-4 text-xs text-[#9CA3AF]">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
                    <span>
                      Entrada permitida somente para maiores de 18 anos com documento
                      oficial com foto.
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#09090D] p-8 text-center">
              <QrCode className="h-10 w-10 text-[#E11D38]" aria-hidden="true" />
              <h2 className="mt-4 font-display text-2xl font-bold text-white uppercase">
                Nenhum Ingresso Carregado
              </h2>
              <p className="mt-2 max-w-md text-sm text-[#9CA3AF]">
                Busque pelo seu código na barra ao lado, compre seu ingresso na aba
                Ingressos ou abra o modelo visual de demonstração.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
