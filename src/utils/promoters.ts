import type { Promoter, TicketReservation, TicketStatus } from '../types/hz';

export const PROMOTER_CODE_REGEX = /^[A-Z0-9]{2,24}$/;

export type PeriodPreset = 'todos' | 'hoje' | '7d' | '30d' | 'personalizado';

export interface PeriodFilter {
  preset: PeriodPreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface PromoterStats {
  id: string;
  name: string;
  code: string;
  active: boolean;
  isDeleted: boolean;
  createdAt: string;
  rank: number;
  ordersCount: number;
  /** Total tickets across approved/paid orders (official sold & paid count) */
  soldTicketsCount: number;
  /** Tickets effectively paid (approved by Mercado Pago / validated at door) */
  paidTicketsCount: number;
  /** Orders currently waiting for Pix confirmation */
  pendingPaymentsCount: number;
  /** Orders cancelled/rejected/refunded in Mercado Pago */
  cancelledPaymentsCount: number;
  /** Total revenue in cents strictly from paid/validated orders */
  totalRevenueCents: number;
  /** Deduplicated orders linked to this promoter within the selected period */
  orders: TicketReservation[];
}

/**
 * Normalizes a promoter identification code: strips accents, keeps only A-Z and 0-9,
 * uppercases, and clamps to 24 characters (e.g. "Júlio " -> "JULIO").
 */
export function normalizePromoterCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
}

/**
 * Validates promoter name & unique code before saving to Firestore.
 */
export function validatePromoterInput(
  input: { name: string; code: string },
  existingPromoters: Promoter[],
  editingPromoterId?: string
): { valid: boolean; error?: string; cleanName: string; cleanCode: string } {
  const cleanName = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  const cleanCode = normalizePromoterCode(input.code);

  if (cleanName.length < 2) {
    return {
      valid: false,
      error: 'Informe o nome do promoter (mínimo 2 caracteres).',
      cleanName,
      cleanCode,
    };
  }

  if (!PROMOTER_CODE_REGEX.test(cleanCode)) {
    return {
      valid: false,
      error: 'O cupom exclusivo deve ter entre 2 e 24 letras/números (ex.: JULIO, FERNANDO).',
      cleanName,
      cleanCode,
    };
  }

  const duplicate = existingPromoters.find(
    (p) =>
      p.id !== editingPromoterId &&
      normalizePromoterCode(p.code) === cleanCode
  );
  if (duplicate) {
    return {
      valid: false,
      error: `O cupom "${cleanCode}" já está em uso pelo promoter ${duplicate.name}. Cada promoter precisa de um código exclusivo.`,
      cleanName,
      cleanCode,
    };
  }

  return { valid: true, cleanName, cleanCode };
}

/**
 * Maps raw Mercado Pago payment status into internal TicketStatus.
 * Only 'approved' becomes 'pago'; cancelled/rejected/refunded/charged_back become 'cancelado'.
 */
export function mapMercadoPagoRawStatusToTicketStatus(
  mpRawStatus: string | undefined
): TicketStatus {
  const status = (mpRawStatus || '').trim().toLowerCase();
  if (status === 'approved') {
    return 'pago';
  }
  if (
    status === 'cancelled' ||
    status === 'rejected' ||
    status === 'refunded' ||
    status === 'charged_back'
  ) {
    return 'cancelado';
  }
  return 'aguardando-pagamento';
}

/**
 * Deduplicates ticket orders by ticketCode (and mpPaymentId when present)
 * so webhook retries or duplicate state merges never double-count promoter sales.
 */
export function deduplicateTicketOrders(
  reservations: TicketReservation[]
): TicketReservation[] {
  const byTicketCode = new Map<string, TicketReservation>();
  const seenPaymentIds = new Set<string>();

  for (const order of reservations) {
    const codeKey = order.ticketCode.trim().toUpperCase();
    if (!codeKey || byTicketCode.has(codeKey)) continue;

    const paymentKey = (order.mpPaymentId || '').trim();
    if (paymentKey && seenPaymentIds.has(paymentKey)) continue;

    byTicketCode.set(codeKey, order);
    if (paymentKey) {
      seenPaymentIds.add(paymentKey);
    }
  }

  return Array.from(byTicketCode.values());
}

/**
 * Filters ticket reservations by period preset or custom YYYY-MM-DD range.
 */
export function filterReservationsByPeriod(
  reservations: TicketReservation[],
  filter: PeriodFilter,
  now: Date = new Date()
): TicketReservation[] {
  if (filter.preset === 'todos') {
    return reservations;
  }

  let startMs: number | null = null;
  let endMs: number | null = null;

  if (filter.preset === 'hoje') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    startMs = start.getTime();
    endMs = end.getTime();
  } else if (filter.preset === '7d') {
    startMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    endMs = now.getTime();
  } else if (filter.preset === '30d') {
    startMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    endMs = now.getTime();
  } else if (filter.preset === 'personalizado') {
    if (filter.startDate) {
      const [y, m, d] = filter.startDate.split('-').map(Number);
      if (y && m && d) {
        startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      }
    }
    if (filter.endDate) {
      const [y, m, d] = filter.endDate.split('-').map(Number);
      if (y && m && d) {
        endMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      }
    }
  }

  return reservations.filter((order) => {
    if (typeof order.createdAtMs !== 'number') {
      return true;
    }
    if (startMs !== null && order.createdAtMs < startMs) return false;
    if (endMs !== null && order.createdAtMs > endMs) return false;
    return true;
  });
}

/**
 * Computes official promoter statistics and automatic ranking.
 * FUNDAMENTAL RULE:
 * - Only effectively paid orders (status === 'pago' || status === 'validado')
 *   count as sold/paid tickets and revenue.
 * - Pending and cancelled payments are tracked separately and NEVER counted as paid.
 * - Preserves full historical attribution for deactivated or deleted promoters.
 */
export function computeRankedPromoterStats(
  promoters: Promoter[],
  reservations: TicketReservation[],
  periodFilter: PeriodFilter = { preset: 'todos' },
  now: Date = new Date()
): PromoterStats[] {
  const uniqueOrders = deduplicateTicketOrders(reservations);
  const periodOrders = filterReservationsByPeriod(uniqueOrders, periodFilter, now);

  const buckets = new Map<
    string,
    {
      id: string;
      name: string;
      code: string;
      active: boolean;
      isDeleted: boolean;
      createdAt: string;
      orders: TicketReservation[];
    }
  >();

  // Seed buckets from registered promoters (active & inactive)
  for (const promoter of promoters) {
    buckets.set(promoter.id, {
      id: promoter.id,
      name: promoter.name,
      code: normalizePromoterCode(promoter.code),
      active: promoter.active,
      isDeleted: false,
      createdAt: promoter.createdAt,
      orders: [],
    });
  }

  // Index by code as fallback for historical orders
  const idByCode = new Map<string, string>();
  for (const promoter of promoters) {
    idByCode.set(normalizePromoterCode(promoter.code), promoter.id);
  }

  // Assign each attributed order (including deleted promoters' historical orders)
  for (const order of periodOrders) {
    const rawId = (order.promoterId || '').trim();
    const rawCode = order.promoterCode ? normalizePromoterCode(order.promoterCode) : '';
    if (!rawId && !rawCode) continue;

    let bucketKey = rawId && buckets.has(rawId) ? rawId : '';
    if (!bucketKey && rawCode && idByCode.has(rawCode)) {
      bucketKey = idByCode.get(rawCode)!;
    }

    if (!bucketKey) {
      // Historical promoter that was deleted — preserve full sales history!
      bucketKey = rawId || `deleted_${rawCode}`;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          id: bucketKey,
          name: order.promoterName || rawCode || 'Promoter Removido',
          code: rawCode || 'REMOVIDO',
          active: false,
          isDeleted: true,
          createdAt: 'Histórico preservado',
          orders: [],
        });
      }
    }

    buckets.get(bucketKey)!.orders.push(order);
  }

  const stats: PromoterStats[] = Array.from(buckets.values()).map((bucket) => {
    let paidTicketsCount = 0;
    let pendingPaymentsCount = 0;
    let cancelledPaymentsCount = 0;
    let totalRevenueCents = 0;

    for (const order of bucket.orders) {
      if (order.status === 'pago' || order.status === 'validado') {
        paidTicketsCount += order.quantity;
        totalRevenueCents += order.totalCents;
      } else if (order.status === 'cancelado') {
        cancelledPaymentsCount += 1;
      } else {
        pendingPaymentsCount += 1;
      }
    }

    const sortedOrders = [...bucket.orders].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
    );

    return {
      id: bucket.id,
      name: bucket.name,
      code: bucket.code,
      active: bucket.active,
      isDeleted: bucket.isDeleted,
      createdAt: bucket.createdAt,
      rank: 0,
      ordersCount: sortedOrders.length,
      soldTicketsCount: paidTicketsCount,
      paidTicketsCount,
      pendingPaymentsCount,
      cancelledPaymentsCount,
      totalRevenueCents,
      orders: sortedOrders,
    };
  });

  // Rank strictly by effectively paid tickets, then revenue, then orders, then name
  stats.sort((a, b) => {
    if (b.paidTicketsCount !== a.paidTicketsCount) {
      return b.paidTicketsCount - a.paidTicketsCount;
    }
    if (b.totalRevenueCents !== a.totalRevenueCents) {
      return b.totalRevenueCents - a.totalRevenueCents;
    }
    if (b.ordersCount !== a.ordersCount) {
      return b.ordersCount - a.ordersCount;
    }
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  return stats.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
