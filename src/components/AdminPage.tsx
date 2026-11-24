import { useMemo, useState, type FormEvent } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  EventEdition,
  PreListEntry,
  TicketReservation,
  TicketStatus,
} from '../types/hz';
import { checkMercadoPagoPaymentStatus } from '../services/paymentsApi';
import { formatBRL } from '../utils/ticketing';

export interface AdminAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

interface AdminPageProps {
  authReady: boolean;
  authUser: AdminAuthUser | null;
  isAuthorizedAdmin: boolean;
  adminLoadError: string | null;
  events: EventEdition[];
  preListEntries: PreListEntry[];
  reservations: TicketReservation[];
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onAddEvent: (event: EventEdition) => Promise<void>;
  onUpdateEventStatus: (id: string, status: EventEdition['status']) => Promise<void>;
  onTogglePreListStatus: (
    id: string,
    currentStatus: 'aguardando' | 'confirmado'
  ) => Promise<void>;
  onRemovePreListEntry: (id: string) => Promise<void>;
  onUpdateTicketStatus: (
    ticketCode: string,
    status: TicketStatus,
    validatedAtLabel?: string
  ) => Promise<void>;
  onValidateTicketCode: (code: string) => Promise<{
    result: 'validated' | 'already-validated' | 'not-found';
    ticket?: TicketReservation;
    wasUnpaid?: boolean;
  }>;
}

type AdminTab = 'visao-geral' | 'eventos' | 'compradores' | 'pre-lista' | 'validador';

export function AdminPage({
  authReady,
  authUser,
  isAuthorizedAdmin,
  adminLoadError,
  events,
  preListEntries,
  reservations,
  onSignInGoogle,
  onSignOut,
  onAddEvent,
  onUpdateEventStatus,
  onTogglePreListStatus,
  onRemovePreListEntry,
  onUpdateTicketStatus,
  onValidateTicketCode,
}: AdminPageProps) {
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('visao-geral');

  // Search & filter states
  const [buyerSearch, setBuyerSearch] = useState('');
  const [preListFilter, setPreListFilter] = useState<'todos' | 'aguardando' | 'confirmado'>('todos');
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [buyerFeedback, setBuyerFeedback] = useState<string | null>(null);

  // New event draft form state
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('22:30 às 05:00');
  const [newVenue, setNewVenue] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventFormFeedback, setEventFormFeedback] = useState<string | null>(null);

  // QR validator state
  const [qrInput, setQrInput] = useState('');
  const [isValidatingQr, setIsValidatingQr] = useState(false);
  const [qrValidationState, setQrValidationState] = useState<{
    result: 'validated' | 'already-validated' | 'not-found';
    code: string;
    ticket?: TicketReservation;
    wasUnpaid?: boolean;
  } | null>(null);

  // Metrics computed strictly from real Firestore records
  const kpis = useMemo(() => {
    const totalTickets = reservations.reduce((acc, r) => acc + r.quantity, 0);
    const totalOrdersCents = reservations.reduce((acc, r) => acc + r.totalCents, 0);
    const paidReservations = reservations.filter(
      (r) => r.status === 'pago' || r.status === 'validado'
    );
    const paidTickets = paidReservations.reduce((acc, r) => acc + r.quantity, 0);
    const paidRevenueCents = paidReservations.reduce(
      (acc, r) => acc + r.totalCents,
      0
    );
    const confirmedPreList = preListEntries.filter(
      (e) => e.status === 'confirmado'
    ).length;
    const validatedCount = reservations.filter((r) => r.status === 'validado').length;
    return {
      totalTickets,
      paidTickets,
      totalOrdersCents,
      paidRevenueCents,
      preListCount: preListEntries.length,
      confirmedPreList,
      validatedCount,
    };
  }, [reservations, preListEntries]);

  const filteredBuyers = useMemo(() => {
    const q = buyerSearch.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter(
      (r) =>
        r.holderName.toLowerCase().includes(q) ||
        r.ticketCode.toLowerCase().includes(q) ||
        r.whatsapp.includes(q)
    );
  }, [reservations, buyerSearch]);

  const filteredPreList = useMemo(() => {
    if (preListFilter === 'todos') return preListEntries;
    return preListEntries.filter((e) => e.status === preListFilter);
  }, [preListEntries, preListFilter]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await onSignInGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Janela de login Google fechada antes da conclusão.');
      } else if (msg.includes('popup-blocked')) {
        setAuthError(
          'O navegador bloqueou o pop-up do Google. Permita pop-ups para este site e tente novamente.'
        );
      } else {
        setAuthError('Não foi possível autenticar com o Google agora. Tente novamente.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCreateEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate.trim() || !newVenue.trim()) {
      setEventFormFeedback('Preencha nome, data e local para adicionar a edição.');
      return;
    }
    const created: EventEdition = {
      id: `hz-${Date.now()}`,
      title: newTitle.trim(),
      subtitle: 'Edição cadastrada no painel administrativo HZ PARTY.',
      dateLabel: newDate.trim(),
      timeRange: newTime.trim() || '22:30 às 05:00',
      venue: newVenue.trim(),
      city: 'Londrina · PR',
      status: 'rascunho',
      capacityLabel: 'Rascunho · +18',
      ageRating: '+18',
      dressCode: 'Underground',
      lineupHighlights: ['DJ Qualificado, Carro de som'],
    };

    setIsSavingEvent(true);
    setEventFormFeedback(null);
    try {
      await onAddEvent(created);
      setNewTitle('');
      setNewDate('');
      setNewVenue('');
      setEventFormFeedback('Evento salvo no Firestore com sucesso.');
    } catch {
      setEventFormFeedback('Erro ao salvar evento no Firestore.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleSyncMpPayment = async (buyer: TicketReservation) => {
    if (!buyer.mpPaymentId) return;
    setBusyActionId(buyer.ticketCode);
    setBuyerFeedback(null);
    try {
      const mp = await checkMercadoPagoPaymentStatus(buyer.mpPaymentId);
      if (mp.normalizedStatus === 'pago') {
        await onUpdateTicketStatus(buyer.ticketCode, 'pago');
        setBuyerFeedback(`Pagamento ${buyer.ticketCode} confirmado via Mercado Pago.`);
      } else {
        setBuyerFeedback(
          `Ingresso ${buyer.ticketCode} segue com status "${mp.status}" no Mercado Pago.`
        );
      }
    } catch (err) {
      setBuyerFeedback(
        err instanceof Error
          ? err.message
          : 'Não foi possível consultar este pagamento no Mercado Pago.'
      );
    } finally {
      setBusyActionId(null);
    }
  };

  const handleManualConfirmPix = async (buyer: TicketReservation) => {
    setBusyActionId(buyer.ticketCode);
    setBuyerFeedback(null);
    try {
      await onUpdateTicketStatus(buyer.ticketCode, 'pago');
      setBuyerFeedback(`Ingresso ${buyer.ticketCode} marcado como Pago.`);
    } catch {
      setBuyerFeedback(`Erro ao atualizar status de ${buyer.ticketCode}.`);
    } finally {
      setBusyActionId(null);
    }
  };

  const handleValidateQr = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = qrInput.trim().toUpperCase();
    if (!cleaned) return;
    setIsValidatingQr(true);
    try {
      const outcome = await onValidateTicketCode(cleaned);
      setQrValidationState({ ...outcome, code: cleaned });
    } finally {
      setIsValidatingQr(false);
    }
  };

  if (!authReady) {
    return (
      <section className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-[#0B0B10] px-6 py-5 text-sm text-[#D1D5DB]">
          <Loader2 className="h-5 w-5 animate-spin text-[#E11D38]" aria-hidden="true" />
          Verificando sessão administrativa...
        </div>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="mx-auto flex max-w-6xl items-center justify-center px-4 py-14 sm:px-6 lg:py-20">
        <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0B0B10] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#DC143C]/40 bg-[#DC143C]/12 text-[#E11D38]">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                Painel Restrito
              </p>
              <h1 className="font-display text-2xl font-bold text-white uppercase">
                Administração HZ PARTY
              </h1>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-md border border-white/10 bg-[#050507] p-3.5 text-xs leading-relaxed text-[#B4B9C4]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
            <p>
              Autenticação real via <strong>Firebase Authentication</strong>. Entre com
              a conta Google autorizada da organização para acessar vendas, lista de
              nomes e validação de portaria.
            </p>
          </div>

          {authError && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-[#E11D38]/40 bg-[#E11D38]/10 px-3.5 py-2.5 text-xs text-[#FDA4AF]"
            >
              {authError}
            </p>
          )}

          <button
            type="button"
            disabled={authBusy}
            onClick={handleGoogleSignIn}
            className="hz-crimson-button mt-6 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-md px-5 py-3 text-xs font-bold tracking-[0.08em] text-white uppercase disabled:opacity-60"
          >
            {authBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Conectando ao Google...
              </>
            ) : (
              'Entrar com Google'
            )}
          </button>
        </div>
      </section>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <section className="mx-auto flex max-w-6xl items-center justify-center px-4 py-14 sm:px-6 lg:py-20">
        <div className="w-full max-w-md rounded-2xl border border-[#E11D38]/35 bg-[#0B0B10] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#DC143C]/40 bg-[#DC143C]/12 text-[#E11D38]">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                Acesso Negado
              </p>
              <h1 className="font-display text-2xl font-bold text-white uppercase">
                Conta Não Autorizada
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-[#C7CBD4]">
            A conta conectada (<span className="font-mono text-white">{authUser.email}</span>) não
            possui permissão administrativa para o painel da HZ PARTY.
          </p>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="mt-6 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-[#050507] px-4 py-2.5 text-xs font-semibold tracking-wider text-white uppercase transition-colors hover:border-[#E11D38]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair desta conta
          </button>
        </div>
      </section>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'eventos', label: 'Eventos', icon: CalendarPlus },
    { id: 'compradores', label: 'Compradores', icon: Ticket },
    { id: 'pre-lista', label: 'Lista', icon: ClipboardList },
    { id: 'validador', label: 'Validar QR', icon: QrCode },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12">
      {/* Admin Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
            Console Operacional · {authUser.email}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-white uppercase sm:text-4xl">
            Dashboard HZ PARTY
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-md border border-white/15 bg-[#0D0D11] px-4 py-2 text-xs font-semibold text-[#D1D5DB] transition-colors hover:border-[#E11D38]/60 hover:text-white sm:self-auto"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sair
        </button>
      </div>

      {adminLoadError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-md border border-[#E11D38]/40 bg-[#E11D38]/10 px-4 py-3 text-xs text-[#FDA4AF]"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
          <span>{adminLoadError}</span>
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div
        role="tablist"
        aria-label="Seções administrativas"
        className="mt-6 flex flex-wrap gap-2 border-b border-white/10 pb-4"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-md border px-4 py-2 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-[#E11D38] bg-[#E11D38]/15 text-white'
                  : 'border-white/10 bg-[#0B0B10] text-[#9CA3AF] hover:border-white/25 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* KPI Cards (Always visible on Visão Geral) */}
      {activeTab === 'visao-geral' && (
        <div className="mt-8 space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hz-card-surface rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span>Ingressos Emitidos</span>
                <Ticket className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              </div>
              <p
                data-testid="kpi-tickets"
                className="mt-3 font-mono text-3xl font-bold text-white tabular-nums"
              >
                {kpis.totalTickets}
              </p>
              <p className="mt-1 text-xs text-[#71717A] tabular-nums">
                {kpis.paidTickets} pagos/validados
              </p>
            </div>

            <div className="hz-card-surface rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span>Faturamento Confirmado</span>
                <DollarSign className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              </div>
              <p
                data-testid="kpi-revenue"
                className="mt-3 font-mono text-3xl font-bold text-white tabular-nums"
              >
                {formatBRL(kpis.paidRevenueCents)}
              </p>
              <p className="mt-1 text-xs text-[#71717A] tabular-nums">
                Pedidos totais: {formatBRL(kpis.totalOrdersCents)}
              </p>
            </div>

            <div className="hz-card-surface rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span>Nomes na Lista</span>
                <Users className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              </div>
              <p
                data-testid="kpi-prelist"
                className="mt-3 font-mono text-3xl font-bold text-white tabular-nums"
              >
                {kpis.preListCount}
              </p>
              <p className="mt-1 text-xs text-[#71717A] tabular-nums">
                {kpis.confirmedPreList} confirmados na lista
              </p>
            </div>

            <div className="hz-card-surface rounded-xl p-5">
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span>Check-ins QR</span>
                <QrCode className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
              </div>
              <p
                data-testid="kpi-validated"
                className="mt-3 font-mono text-3xl font-bold text-white tabular-nums"
              >
                {kpis.validatedCount}
              </p>
              <p className="mt-1 text-xs text-[#71717A]">
                Passes validados na portaria
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="hz-card-surface rounded-xl p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white uppercase">
                  Últimos Compradores
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('compradores')}
                  className="text-xs font-semibold text-[#E11D38] hover:text-white"
                >
                  Ver lista →
                </button>
              </div>
              {reservations.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#9CA3AF]">
                  Nenhum pedido registrado ainda no Firestore.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-white/10 text-sm">
                  {reservations.slice(0, 4).map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-semibold text-white">{r.holderName}</p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {r.ticketCode} · {r.tierName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-white tabular-nums">
                          {formatBRL(r.totalCents)}
                        </p>
                        <p
                          className={`text-[11px] font-semibold uppercase ${
                            r.status === 'validado' || r.status === 'pago'
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {r.status === 'validado'
                            ? 'Validado'
                            : r.status === 'pago'
                              ? 'Pago'
                              : 'Aguardando Pix'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="hz-card-surface rounded-xl p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="font-display text-xl font-bold text-white uppercase">
                  Últimos Nomes na Lista
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('pre-lista')}
                  className="text-xs font-semibold text-[#E11D38] hover:text-white"
                >
                  Gerenciar →
                </button>
              </div>
              {preListEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#9CA3AF]">
                  Nenhum nome registrado ainda. Os cadastros da aba Lista aparecem
                  aqui em tempo real.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-white/10 text-sm">
                  {preListEntries.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-semibold text-white">{entry.fullName}</p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {entry.protocol} · {entry.whatsapp}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold uppercase ${
                          entry.status === 'confirmado'
                            ? 'text-emerald-400'
                            : 'text-[#E11D38]'
                        }`}
                      >
                        {entry.status === 'confirmado' ? 'Confirmado' : 'Na Lista'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Eventos Management */}
      {activeTab === 'eventos' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Edições Cadastradas ({events.length})
            </h2>
            {events.map((ev) => (
              <div
                key={ev.id}
                className="hz-card-surface flex flex-col justify-between gap-4 rounded-xl p-5 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#E11D38] uppercase">
                    {ev.dateLabel} · {ev.timeRange}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-white uppercase">
                    {ev.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#9CA3AF]">
                    {ev.venue} · {ev.city}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor={`status-${ev.id}`} className="sr-only">
                    Status de {ev.title}
                  </label>
                  <select
                    id={`status-${ev.id}`}
                    value={ev.status}
                    onChange={(e) =>
                      void onUpdateEventStatus(
                        ev.id,
                        e.target.value as EventEdition['status']
                      )
                    }
                    className="min-h-[40px] rounded-md border border-white/15 bg-[#050507] px-3 py-1.5 text-xs font-semibold text-white focus:border-[#E11D38] focus:outline-none"
                  >
                    <option value="proximo">Próximo Evento</option>
                    <option value="em-breve">Em Breve</option>
                    <option value="rascunho">Rascunho</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleCreateEvent}
            className="hz-card-surface h-fit rounded-xl p-6 lg:col-span-5"
          >
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Novo Rascunho de Evento
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="new-ev-title"
                  className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
                >
                  Nome da Edição
                </label>
                <input
                  id="new-ev-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex.: HZ PARTY — Edição Outono"
                  className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3 py-2 text-sm text-white focus:border-[#E11D38] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-ev-date"
                    className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
                  >
                    Data
                  </label>
                  <input
                    id="new-ev-date"
                    type="text"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    placeholder="Ex.: 14 de Março"
                    className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3 py-2 text-sm text-white focus:border-[#E11D38] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-ev-time"
                    className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
                  >
                    Horário
                  </label>
                  <input
                    id="new-ev-time"
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3 py-2 font-mono text-sm text-white focus:border-[#E11D38] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="new-ev-venue"
                  className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
                >
                  Local
                </label>
                <input
                  id="new-ev-venue"
                  type="text"
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                  placeholder="Ex.: Espaço de Lazer Alto da Gávea"
                  className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3 py-2 text-sm text-white focus:border-[#E11D38] focus:outline-none"
                />
              </div>

              {eventFormFeedback && (
                <p className="text-xs text-[#E2E4E9]">{eventFormFeedback}</p>
              )}

              <button
                type="submit"
                disabled={isSavingEvent}
                className="hz-crimson-button flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-bold tracking-wider text-white uppercase disabled:opacity-60"
              >
                {isSavingEvent ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Salvando...
                  </>
                ) : (
                  'Adicionar ao Catálogo'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Buyers Table */}
      {activeTab === 'compradores' && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Lista de Compradores
            </h2>
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={buyerSearch}
                onChange={(e) => setBuyerSearch(e.target.value)}
                placeholder="Filtrar nome, código ou WhatsApp..."
                aria-label="Filtrar compradores"
                className="min-h-[42px] w-full rounded-md border border-white/15 bg-[#0B0B10] py-2 pr-3 pl-9 text-sm text-white focus:border-[#E11D38] focus:outline-none"
              />
            </div>
          </div>

          {buyerFeedback && (
            <p className="rounded-md border border-white/15 bg-[#0B0B10] px-4 py-2.5 text-xs text-[#E2E4E9]">
              {buyerFeedback}
            </p>
          )}

          <div className="hz-card-surface overflow-x-auto rounded-xl">
            {filteredBuyers.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[#D1D5DB]">
                  Nenhum comprador registrado ainda.
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Os pedidos gerados na aba Ingressos aparecem aqui em tempo real.
                </p>
              </div>
            ) : (
              <table className="w-full min-w-[740px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wider text-[#9CA3AF] uppercase">
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">Titular</th>
                    <th className="px-4 py-3 font-semibold">Categoria</th>
                    <th className="px-4 py-3 text-right font-semibold">Qtd</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredBuyers.map((buyer) => (
                    <tr key={buyer.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#E11D38]">
                        {buyer.ticketCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{buyer.holderName}</p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {buyer.whatsapp || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#D1D5DB]">
                        {buyer.tierName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-white">
                        {buyer.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-white">
                        {formatBRL(buyer.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            buyer.status === 'validado' || buyer.status === 'pago'
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }
                        >
                          {buyer.status === 'validado'
                            ? 'Validado'
                            : buyer.status === 'pago'
                              ? 'Pago'
                              : 'Aguardando Pix'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {buyer.status === 'aguardando-pagamento' && (
                          <div className="inline-flex items-center gap-1.5">
                            {buyer.mpPaymentId && (
                              <button
                                type="button"
                                disabled={busyActionId === buyer.ticketCode}
                                onClick={() => void handleSyncMpPayment(buyer)}
                                className="inline-flex items-center gap-1 rounded border border-white/15 bg-[#121218] px-2.5 py-1 text-xs font-semibold text-white hover:border-[#E11D38] disabled:opacity-60"
                              >
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                Sincronizar MP
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyActionId === buyer.ticketCode}
                              onClick={() => void handleManualConfirmPix(buyer)}
                              className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                            >
                              Confirmar Pago
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* List Management */}
      {activeTab === 'pre-lista' && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Gerenciamento da Lista
            </h2>

            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#09090D] p-1">
              {(['todos', 'aguardando', 'confirmado'] as const).map((statusFilter) => (
                <button
                  key={statusFilter}
                  type="button"
                  onClick={() => setPreListFilter(statusFilter)}
                  className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold uppercase transition-colors ${
                    preListFilter === statusFilter
                      ? 'bg-[#E11D38] text-white'
                      : 'text-[#9CA3AF] hover:text-white'
                  }`}
                >
                  {statusFilter === 'todos' ? 'Todos' : statusFilter}
                </button>
              ))}
            </div>
          </div>

          <div className="hz-card-surface overflow-x-auto rounded-xl">
            {filteredPreList.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[#D1D5DB]">
                  Nenhum nome registrado na lista para este filtro.
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Adicione um nome pelo formulário na aba Lista para gerenciar aqui.
                </p>
              </div>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs tracking-wider text-[#9CA3AF] uppercase">
                    <th className="px-4 py-3 font-semibold">Protocolo</th>
                    <th className="px-4 py-3 font-semibold">Nome</th>
                    <th className="px-4 py-3 font-semibold">WhatsApp</th>
                    <th className="px-4 py-3 font-semibold">Lista</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredPreList.map((entry) => (
                    <tr key={entry.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#E11D38]">
                        {entry.protocol}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {entry.fullName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#D1D5DB]">
                        {entry.whatsapp}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#D1D5DB] uppercase">
                        Na Lista
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            entry.status === 'confirmado'
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }
                        >
                          {entry.status === 'confirmado'
                            ? 'Confirmado'
                            : 'Aguardando'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void onTogglePreListStatus(entry.id, entry.status)
                            }
                            className="rounded border border-white/15 bg-[#121218] px-2.5 py-1 text-xs font-semibold text-white hover:border-[#E11D38]"
                          >
                            {entry.status === 'confirmado' ? 'Reabrir' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover ${entry.fullName}`}
                            onClick={() => void onRemovePreListEntry(entry.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 text-[#9CA3AF] hover:border-[#E11D38] hover:text-[#E11D38]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* QR Code Validation Area */}
      {activeTab === 'validador' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <form
            onSubmit={handleValidateQr}
            className="hz-card-surface rounded-xl p-6 lg:col-span-6"
          >
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Validação de QR Code na Portaria
            </h2>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              Digite ou cole o código de um ingresso (ex.:{' '}
              <span className="font-mono text-white">HZ-XXXXXX</span>) para registrar o
              check-in no Firestore.
            </p>

            <div className="mt-5 flex gap-2">
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Código do ingresso (HZ-XXXXXX)"
                aria-label="Código do ingresso para validação"
                className="min-h-[44px] flex-1 rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 font-mono text-sm text-white uppercase placeholder:normal-case placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isValidatingQr}
                className="hz-crimson-button min-h-[44px] rounded-md px-5 py-2 text-xs font-bold tracking-wider text-white uppercase whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isValidatingQr ? 'Validando...' : 'Validar Código'}
              </button>
            </div>

            {reservations.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold tracking-wider text-[#9CA3AF] uppercase">
                  Últimos Códigos Registrados
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {reservations.slice(0, 10).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setQrInput(r.ticketCode)}
                      className="rounded border border-white/15 bg-[#050507] px-3 py-1.5 font-mono text-xs text-white hover:border-[#E11D38]"
                    >
                      {r.ticketCode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>

          <div className="hz-card-surface flex flex-col justify-center rounded-xl p-6 lg:col-span-6">
            {!qrValidationState ? (
              <div className="py-6 text-center">
                <QrCode className="mx-auto h-10 w-10 text-[#9CA3AF]" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-white">
                  Aguardando leitura de código
                </p>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  O resultado do check-in aparecerá aqui instantaneamente.
                </p>
              </div>
            ) : qrValidationState.result === 'validated' && qrValidationState.ticket ? (
              <div
                data-testid="qr-validation-result"
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5"
              >
                <div className="flex items-center gap-2.5 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  <span className="font-display text-xl font-bold uppercase">
                    Entrada Liberada — Check-in Concluído
                  </span>
                </div>
                <p className="mt-3 text-sm text-white">
                  Titular: <strong>{qrValidationState.ticket.holderName}</strong>
                </p>
                <p className="mt-1 font-mono text-xs text-[#D1D5DB]">
                  {qrValidationState.ticket.ticketCode} ·{' '}
                  {qrValidationState.ticket.tierName}
                </p>
                {qrValidationState.wasUnpaid && (
                  <p className="mt-3 rounded border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                    Atenção: este pedido constava como Aguardando Pix antes da
                    validação na portaria.
                  </p>
                )}
              </div>
            ) : qrValidationState.result === 'already-validated' &&
              qrValidationState.ticket ? (
              <div
                data-testid="qr-validation-result"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5"
              >
                <div className="flex items-center gap-2.5 text-amber-300">
                  <ShieldAlert className="h-6 w-6" aria-hidden="true" />
                  <span className="font-display text-xl font-bold uppercase">
                    Ingresso Já Utilizado
                  </span>
                </div>
                <p className="mt-3 text-sm text-white">
                  Titular: <strong>{qrValidationState.ticket.holderName}</strong>
                </p>
                <p className="mt-1 font-mono text-xs text-[#D1D5DB]">
                  Validado às {qrValidationState.ticket.validatedAt || '—'}
                </p>
              </div>
            ) : (
              <div
                data-testid="qr-validation-result"
                className="rounded-lg border border-[#E11D38]/50 bg-[#E11D38]/10 p-5"
              >
                <div className="flex items-center gap-2.5 text-[#FDA4AF]">
                  <XCircle className="h-6 w-6 text-[#E11D38]" aria-hidden="true" />
                  <span className="font-display text-xl font-bold uppercase">
                    Código Não Encontrado
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#D1D5DB]">
                  O código <span className="font-mono text-white">{qrValidationState.code}</span>{' '}
                  não corresponde a nenhum ingresso registrado.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
