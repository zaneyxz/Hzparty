import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  Eye,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Tag,
  Ticket,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import type { Promoter, TicketReservation } from '../types/hz';
import { formatBRL } from '../utils/ticketing';
import {
  computeRankedPromoterStats,
  normalizePromoterCode,
  validatePromoterInput,
  type PeriodFilter,
  type PeriodPreset,
  type PromoterStats,
} from '../utils/promoters';

interface PromotersPanelProps {
  promoters: Promoter[];
  reservations: TicketReservation[];
  onCreatePromoter: (input: {
    name: string;
    code: string;
    active: boolean;
  }) => Promise<void>;
  onUpdatePromoter: (
    promoterId: string,
    input: { name: string; code: string; active: boolean }
  ) => Promise<void>;
  onTogglePromoterActive: (promoterId: string, currentActive: boolean) => Promise<void>;
  onDeletePromoter: (promoterId: string) => Promise<void>;
  onSyncPendingPayments: () => Promise<{
    checked: number;
    approved: number;
    cancelled: number;
  }>;
}

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: 'todos', label: 'Todo o período' },
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'personalizado', label: 'Período personalizado' },
];

function renderOrderStatusLabel(status: TicketReservation['status']): {
  label: string;
  className: string;
} {
  if (status === 'validado') {
    return { label: 'Pago · Validado', className: 'text-emerald-400' };
  }
  if (status === 'pago') {
    return { label: 'Pago (Aprovado)', className: 'text-emerald-400' };
  }
  if (status === 'cancelado') {
    return { label: 'Cancelado', className: 'text-[#FDA4AF]' };
  }
  return { label: 'Aguardando Pix', className: 'text-amber-300' };
}

export function PromotersPanel({
  promoters,
  reservations,
  onCreatePromoter,
  onUpdatePromoter,
  onTogglePromoterActive,
  onDeletePromoter,
  onSyncPendingPayments,
}: PromotersPanelProps) {
  // Period filtering shared between overview and individual report
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('todos');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selected promoter for Individual Report view
  const [selectedPromoterId, setSelectedPromoterId] = useState<string | null>(null);

  // Create / Edit promoter form state
  const [showForm, setShowForm] = useState(false);
  const [editingPromoterId, setEditingPromoterId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Row actions & Mercado Pago bulk sync state
  const [busyPromoterId, setBusyPromoterId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSyncingMp, setIsSyncingMp] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const periodFilter: PeriodFilter = useMemo(
    () => ({
      preset: periodPreset,
      startDate: customStartDate || undefined,
      endDate: customEndDate || undefined,
    }),
    [periodPreset, customStartDate, customEndDate]
  );

  const rankedStats = useMemo(
    () => computeRankedPromoterStats(promoters, reservations, periodFilter),
    [promoters, reservations, periodFilter]
  );

  const selectedPromoter: PromoterStats | null = useMemo(() => {
    if (!selectedPromoterId) return null;
    return rankedStats.find((p) => p.id === selectedPromoterId) ?? null;
  }, [rankedStats, selectedPromoterId]);

  const overviewTotals = useMemo(() => {
    const activePromotersCount = promoters.filter((p) => p.active).length;
    const paidTicketsTotal = rankedStats.reduce((sum, p) => sum + p.paidTicketsCount, 0);
    const pendingOrdersTotal = rankedStats.reduce(
      (sum, p) => sum + p.pendingPaymentsCount,
      0
    );
    const cancelledOrdersTotal = rankedStats.reduce(
      (sum, p) => sum + p.cancelledPaymentsCount,
      0
    );
    const revenueTotalCents = rankedStats.reduce(
      (sum, p) => sum + p.totalRevenueCents,
      0
    );
    return {
      activePromotersCount,
      paidTicketsTotal,
      pendingOrdersTotal,
      cancelledOrdersTotal,
      revenueTotalCents,
    };
  }, [promoters, rankedStats]);

  const openCreateForm = () => {
    setEditingPromoterId(null);
    setFormName('');
    setFormCode('');
    setFormActive(true);
    setFormError(null);
    setFormFeedback(null);
    setShowForm(true);
  };

  const openEditForm = (promoter: PromoterStats) => {
    if (promoter.isDeleted) return;
    setEditingPromoterId(promoter.id);
    setFormName(promoter.name);
    setFormCode(promoter.code);
    setFormActive(promoter.active);
    setFormError(null);
    setFormFeedback(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPromoterId(null);
    setFormError(null);
  };

  const handleSavePromoter = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormFeedback(null);

    const validation = validatePromoterInput(
      { name: formName, code: formCode },
      promoters,
      editingPromoterId ?? undefined
    );

    if (!validation.valid) {
      setFormError(validation.error || 'Dados inválidos.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingPromoterId) {
        await onUpdatePromoter(editingPromoterId, {
          name: validation.cleanName,
          code: validation.cleanCode,
          active: formActive,
        });
        setFormFeedback(
          `Promoter ${validation.cleanName} (${validation.cleanCode}) atualizado com sucesso.`
        );
      } else {
        await onCreatePromoter({
          name: validation.cleanName,
          code: validation.cleanCode,
          active: formActive,
        });
        setFormFeedback(
          `Promoter ${validation.cleanName} (${validation.cleanCode}) cadastrado com sucesso.`
        );
      }
      setShowForm(false);
      setEditingPromoterId(null);
      setFormName('');
      setFormCode('');
      setFormActive(true);
    } catch {
      setFormError('Erro ao salvar promoter no Firebase. Verifique suas permissões.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (promoter: PromoterStats) => {
    if (promoter.isDeleted) return;
    setBusyPromoterId(promoter.id);
    try {
      await onTogglePromoterActive(promoter.id, promoter.active);
    } finally {
      setBusyPromoterId(null);
    }
  };

  const handleConfirmDelete = async (promoterId: string) => {
    setBusyPromoterId(promoterId);
    try {
      await onDeletePromoter(promoterId);
      setConfirmDeleteId(null);
      if (selectedPromoterId === promoterId) {
        setSelectedPromoterId(null);
      }
    } finally {
      setBusyPromoterId(null);
    }
  };

  const handleSyncMp = async () => {
    setIsSyncingMp(true);
    setSyncFeedback(null);
    try {
      const res = await onSyncPendingPayments();
      if (res.checked === 0) {
        setSyncFeedback('Nenhum pedido pendente com ID do Mercado Pago para sincronizar.');
      } else {
        setSyncFeedback(
          `Sincronização concluída: ${res.checked} verificado(s) · ${res.approved} aprovado(s) · ${res.cancelled} cancelado(s).`
        );
      }
    } catch {
      setSyncFeedback('Não foi possível sincronizar os pagamentos pendentes agora.');
    } finally {
      setIsSyncingMp(false);
    }
  };

  const renderPeriodFilterBar = () => (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#09090D] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[#9CA3AF] uppercase">
          <Calendar className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
          Período:
        </span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPeriodPreset(opt.id)}
            className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              periodPreset === opt.id
                ? 'bg-[#E11D38] text-white'
                : 'border border-white/10 bg-[#050507] text-[#9CA3AF] hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {periodPreset === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-[#9CA3AF]">
            <span>De</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="min-h-[36px] rounded-md border border-white/15 bg-[#050507] px-2.5 py-1 font-mono text-xs text-white focus:border-[#E11D38] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[#9CA3AF]">
            <span>Até</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="min-h-[36px] rounded-md border border-white/15 bg-[#050507] px-2.5 py-1 font-mono text-xs text-white focus:border-[#E11D38] focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );

  // INDIVIDUAL PROMOTER REPORT VIEW
  if (selectedPromoter) {
    return (
      <div className="mt-8 space-y-6">
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
          <div>
            <button
              type="button"
              onClick={() => setSelectedPromoterId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[#E11D38] uppercase transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar para Promoters
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-3xl font-extrabold text-white uppercase">
                {selectedPromoter.name}
              </h2>
              <span className="rounded border border-[#E11D38]/40 bg-[#E11D38]/12 px-2.5 py-0.5 font-mono text-xs font-bold text-[#FDA4AF]">
                {selectedPromoter.code}
              </span>
              <span
                className={`rounded px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                  selectedPromoter.isDeleted
                    ? 'bg-white/10 text-[#9CA3AF]'
                    : selectedPromoter.active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {selectedPromoter.isDeleted
                  ? 'Excluído · Histórico Preservado'
                  : selectedPromoter.active
                    ? 'Ativo no Checkout'
                    : 'Inativo'}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Posição no Ranking: <strong className="text-white">{selectedPromoter.rank}º lugar</strong> ·
              Cadastro: {selectedPromoter.createdAt} · Cupom exclusivo de identificação (sem desconto)
            </p>
          </div>

          <button
            type="button"
            disabled={isSyncingMp}
            onClick={() => void handleSyncMp()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-md border border-white/15 bg-[#0D0D11] px-4 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:border-[#E11D38] disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#E11D38] ${isSyncingMp ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isSyncingMp ? 'Sincronizando...' : 'Sincronizar Pagamentos MP'}
          </button>
        </div>

        {syncFeedback && (
          <p className="rounded-md border border-white/15 bg-[#0B0B10] px-4 py-2.5 text-xs text-[#E2E4E9]">
            {syncFeedback}
          </p>
        )}

        {renderPeriodFilterBar()}

        {/* Individual KPI Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="hz-card-surface rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Ingressos Vendidos (Pagos)</span>
              <Ticket className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-400 tabular-nums">
              {selectedPromoter.paidTicketsCount}
            </p>
            <p className="mt-1 text-xs text-[#71717A]">
              Somente pagamentos aprovados pelo Mercado Pago
            </p>
          </div>

          <div className="hz-card-surface rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Valor Arrecadado</span>
              <DollarSign className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
              {formatBRL(selectedPromoter.totalRevenueCents)}
            </p>
            <p className="mt-1 text-xs text-[#71717A]">
              Receita líquida confirmada no período
            </p>
          </div>

          <div className="hz-card-surface rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Pedidos Realizados</span>
              <Users className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
              {selectedPromoter.ordersCount}
            </p>
            <p className="mt-1 text-xs text-[#71717A]">
              Sem duplicidade (ID único por pedido)
            </p>
          </div>

          <div className="hz-card-surface rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Pendentes / Cancelados</span>
              <Clock className="h-4 w-4 text-amber-300" aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
              <span className="text-amber-300">{selectedPromoter.pendingPaymentsCount}</span>
              <span className="mx-1.5 text-lg text-[#52525B]">/</span>
              <span className="text-[#FDA4AF]">{selectedPromoter.cancelledPaymentsCount}</span>
            </p>
            <p className="mt-1 text-xs text-[#71717A]">
              Não contabilizados no ranking oficial
            </p>
          </div>
        </div>

        {/* Buyers & Orders History Table */}
        <div className="hz-card-surface overflow-x-auto rounded-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h3 className="font-display text-xl font-bold text-white uppercase">
              Histórico de Compras e Compradores ({selectedPromoter.orders.length})
            </h3>
          </div>

          {selectedPromoter.orders.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-[#D1D5DB]">
                Nenhuma compra vinculada a {selectedPromoter.name} neste período.
              </p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Quando clientes selecionarem {selectedPromoter.code} no checkout, os pedidos
                aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[740px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wider text-[#9CA3AF] uppercase">
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Comprador</th>
                  <th className="px-4 py-3 font-semibold">Ingressos</th>
                  <th className="px-4 py-3 text-right font-semibold">Qtd</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Data e Horário</th>
                  <th className="px-4 py-3 font-semibold">Status Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {selectedPromoter.orders.map((order) => {
                  const statusMeta = renderOrderStatusLabel(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#E11D38]">
                        {order.ticketCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{order.holderName}</p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {order.whatsapp || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#D1D5DB]">
                        {order.tierName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-white tabular-nums">
                        {order.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-white tabular-nums">
                        {formatBRL(order.totalCents)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#D1D5DB] tabular-nums">
                        {order.createdAtFull || order.createdAt}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span className={statusMeta.className}>{statusMeta.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // MAIN PROMOTERS OVERVIEW & RANKING DASHBOARD
  return (
    <div className="mt-8 space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Sistema de Promoters & Cupons de Identificação
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Cupons exclusivos sem desconto para rastrear vendas por promoter. Somente
            pagamentos aprovados pelo Mercado Pago contam no ranking oficial.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={isSyncingMp}
            onClick={() => void handleSyncMp()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-white/15 bg-[#0D0D11] px-4 py-2 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:border-[#E11D38] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#E11D38] ${isSyncingMp ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isSyncingMp ? 'Sincronizando...' : 'Sincronizar MP'}
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="hz-crimson-button inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md px-5 py-2 text-xs font-bold tracking-wider text-white uppercase"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo Promoter
          </button>
        </div>
      </div>

      {syncFeedback && (
        <p className="rounded-md border border-white/15 bg-[#0B0B10] px-4 py-2.5 text-xs text-[#E2E4E9]">
          {syncFeedback}
        </p>
      )}

      {formFeedback && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-200">
          {formFeedback}
        </p>
      )}

      {/* Create / Edit Promoter Form */}
      {showForm && (
        <form
          onSubmit={handleSavePromoter}
          className="hz-card-surface rounded-xl border border-[#DC143C]/45 p-6"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-display text-xl font-bold text-white uppercase">
              {editingPromoterId ? 'Editar Promoter' : 'Cadastrar Novo Promoter'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="text-xs font-semibold text-[#9CA3AF] hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="promoter-name"
                className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
              >
                Nome do Promoter
              </label>
              <input
                id="promoter-name"
                type="text"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (!editingPromoterId && !formCode) {
                    setFormCode(normalizePromoterCode(e.target.value));
                  }
                }}
                placeholder="Ex.: Julio, Fernando, Gustavo..."
                className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 text-sm text-white focus:border-[#E11D38] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="promoter-code"
                className="block text-xs font-semibold tracking-wider text-[#D1D5DB] uppercase"
              >
                Cupom Exclusivo (Sem Desconto)
              </label>
              <input
                id="promoter-code"
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(normalizePromoterCode(e.target.value))}
                placeholder="Ex.: JULIO"
                className="mt-1.5 min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2 font-mono text-sm font-bold text-white uppercase focus:border-[#E11D38] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[#71717A]">
                Apenas letras e números (2 a 24 caracteres). Não altera o preço do ingresso.
              </p>
            </div>
          </div>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[#D1D5DB]">
            <input
              type="checkbox"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="h-4 w-4 accent-[#E11D38]"
            />
            Promoter ativo (visível para seleção no checkout de ingressos)
          </label>

          {formError && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-[#E11D38]/45 bg-[#E11D38]/12 px-3.5 py-2 text-xs text-[#FDA4AF]"
            >
              {formError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={isSaving}
              className="hz-crimson-button inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-6 py-2 text-xs font-bold tracking-wider text-white uppercase disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editingPromoterId ? 'Salvar Alterações' : 'Cadastrar Promoter'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-white/15 bg-[#050507] px-5 py-2 text-xs font-semibold text-[#D1D5DB] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Period Filter */}
      {renderPeriodFilterBar()}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Promoters Ativos</span>
            <Tag className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
            {overviewTotals.activePromotersCount}
          </p>
          <p className="mt-1 text-xs text-[#71717A] tabular-nums">
            {promoters.length} cadastrado(s) no total
          </p>
        </div>

        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Ingressos Pagos (Promoters)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-400 tabular-nums">
            {overviewTotals.paidTicketsTotal}
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Confirmados pelo Mercado Pago
          </p>
        </div>

        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Arrecadação via Promoters</span>
            <DollarSign className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
            {formatBRL(overviewTotals.revenueTotalCents)}
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Total pago sem descontos
          </p>
        </div>

        <div className="hz-card-surface rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Pendentes / Cancelados</span>
            <XCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
            <span className="text-amber-300">{overviewTotals.pendingOrdersTotal}</span>
            <span className="mx-1.5 text-lg text-[#52525B]">/</span>
            <span className="text-[#FDA4AF]">{overviewTotals.cancelledOrdersTotal}</span>
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Excluídos do ranking oficial
          </p>
        </div>
      </div>

      {/* Automatic Promoters Ranking */}
      <div className="hz-card-surface rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#E11D38]" aria-hidden="true" />
            <h3 className="font-display text-xl font-bold text-white uppercase">
              Ranking de Promoters
            </h3>
          </div>
          <span className="text-xs text-[#9CA3AF]">
            Ordenado por ingressos efetivamente pagos · clique para abrir relatório
          </span>
        </div>

        {rankedStats.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9CA3AF]">
            Nenhum promoter cadastrado ainda. Clique em <strong>Novo Promoter</strong> para
            começar (ex.: JULIO, FERNANDO, GUSTAVO, PEDRO).
          </p>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {rankedStats.slice(0, 10).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPromoterId(item.id)}
                  className="flex w-full flex-col justify-between gap-2 rounded-lg border border-white/10 bg-[#050507] px-4 py-3 text-left transition-colors hover:border-[#E11D38]/70 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-extrabold ${
                        item.rank === 1 && item.paidTicketsCount > 0
                          ? 'bg-[#E11D38] text-white'
                          : item.rank === 2 && item.paidTicketsCount > 0
                            ? 'bg-white/15 text-white'
                            : item.rank === 3 && item.paidTicketsCount > 0
                              ? 'bg-amber-500/20 text-amber-200'
                              : 'bg-white/5 text-[#9CA3AF]'
                      }`}
                    >
                      {item.rank}º
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">
                          {item.code}
                        </span>
                        <span className="text-xs text-[#9CA3AF]">({item.name})</span>
                        {item.isDeleted && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF] uppercase">
                            Histórico
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#71717A] tabular-nums">
                        {item.ordersCount} pedido(s) · {item.pendingPaymentsCount} pendente(s)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pl-11 sm:justify-end sm:pl-0">
                    <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                      {item.paidTicketsCount}{' '}
                      {item.paidTicketsCount === 1 ? 'ingresso pago' : 'ingressos pagos'}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#D1D5DB] tabular-nums">
                      {formatBRL(item.totalRevenueCents)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Detailed Performance & Management Table */}
      <div className="hz-card-surface overflow-x-auto rounded-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="font-display text-xl font-bold text-white uppercase">
            Resultados e Gestão de Promoters ({rankedStats.length})
          </h3>
        </div>

        {rankedStats.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9CA3AF]">
            Cadastre seus promoters acima para acompanhar vendas e rankings em tempo real.
          </div>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wider text-[#9CA3AF] uppercase">
                <th className="px-4 py-3 font-semibold">Promoter / Cupom</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-3 text-right font-semibold">Vendidos / Pagos</th>
                <th className="px-4 py-3 text-right font-semibold">Pendentes</th>
                <th className="px-4 py-3 text-right font-semibold">Cancelados</th>
                <th className="px-4 py-3 text-right font-semibold">Arrecadado</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rankedStats.map((promoter) => (
                <tr key={promoter.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPromoterId(promoter.id)}
                      className="text-left group"
                    >
                      <p className="font-semibold text-white group-hover:text-[#E11D38] transition-colors">
                        {promoter.name}
                      </p>
                      <p className="font-mono text-xs font-bold text-[#E11D38]">
                        {promoter.code}
                      </p>
                    </button>
                  </td>

                  <td className="px-4 py-3 text-xs font-semibold">
                    {promoter.isDeleted ? (
                      <span className="text-[#9CA3AF]">Excluído (Histórico)</span>
                    ) : promoter.active ? (
                      <span className="text-emerald-400">Ativo</span>
                    ) : (
                      <span className="text-amber-300">Inativo</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-white tabular-nums">
                    {promoter.ordersCount}
                  </td>

                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 tabular-nums">
                    {promoter.paidTicketsCount}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-amber-300 tabular-nums">
                    {promoter.pendingPaymentsCount}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-[#FDA4AF] tabular-nums">
                    {promoter.cancelledPaymentsCount}
                  </td>

                  <td className="px-4 py-3 text-right font-mono font-semibold text-white tabular-nums">
                    {formatBRL(promoter.totalRevenueCents)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {confirmDeleteId === promoter.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] text-[#FDA4AF]">
                          Manter histórico?
                        </span>
                        <button
                          type="button"
                          disabled={busyPromoterId === promoter.id}
                          onClick={() => void handleConfirmDelete(promoter.id)}
                          className="rounded bg-[#E11D38] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#be123c] disabled:opacity-60"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded border border-white/15 px-2 py-1 text-xs text-[#D1D5DB] hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedPromoterId(promoter.id)}
                          aria-label={`Ver relatório de ${promoter.name}`}
                          className="inline-flex items-center gap-1 rounded border border-white/15 bg-[#121218] px-2.5 py-1 text-xs font-semibold text-white hover:border-[#E11D38]"
                        >
                          <Eye className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          Relatório
                        </button>

                        {!promoter.isDeleted && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(promoter)}
                              aria-label={`Editar ${promoter.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 text-[#D1D5DB] hover:border-white/35 hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              disabled={busyPromoterId === promoter.id}
                              onClick={() => void handleToggleActive(promoter)}
                              aria-label={
                                promoter.active
                                  ? `Desativar ${promoter.name}`
                                  : `Ativar ${promoter.name}`
                              }
                              title={promoter.active ? 'Desativar promoter' : 'Ativar promoter'}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 transition-colors disabled:opacity-50 ${
                                promoter.active
                                  ? 'text-emerald-400 hover:border-amber-400 hover:text-amber-300'
                                  : 'text-amber-300 hover:border-emerald-400 hover:text-emerald-400'
                              }`}
                            >
                              <Power className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              disabled={busyPromoterId === promoter.id}
                              onClick={() => setConfirmDeleteId(promoter.id)}
                              aria-label={`Excluir ${promoter.name}`}
                              title="Excluir promoter (histórico de vendas é preservado)"
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 text-[#9CA3AF] hover:border-[#E11D38] hover:text-[#E11D38] disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
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
  );
}
