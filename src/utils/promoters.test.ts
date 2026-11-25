import test from 'node:test';
import assert from 'node:assert/strict';
import type { Promoter, TicketReservation } from '../types/hz';
import {
  computeRankedPromoterStats,
  deduplicateTicketOrders,
  filterReservationsByPeriod,
  mapMercadoPagoRawStatusToTicketStatus,
  normalizePromoterCode,
  validatePromoterInput,
} from './promoters';

const basePromoters: Promoter[] = [
  { id: 'prom_julio', name: 'Julio', code: 'JULIO', active: true, createdAt: '01/12/2026' },
  { id: 'prom_fernando', name: 'Fernando', code: 'FERNANDO', active: true, createdAt: '01/12/2026' },
  { id: 'prom_gustavo', name: 'Gustavo', code: 'GUSTAVO', active: false, createdAt: '01/12/2026' },
];

function makeOrder(overrides: Partial<TicketReservation>): TicketReservation {
  return {
    id: overrides.ticketCode ?? 'HZ-AA11BB',
    ticketCode: 'HZ-AA11BB',
    holderName: 'Cliente Teste',
    whatsapp: '(43) 99999-0000',
    eventTitle: 'HZ PARTY',
    eventDate: '12 de Dezembro',
    eventTime: '22:30 às 05:00',
    venue: 'Chácara: Espaço de Lazer Alto da Gávea',
    tierName: '1x Ingresso Homem',
    quantity: 1,
    totalCents: 2200,
    mpPaymentId: 'mp_1',
    createdAt: '22:30',
    createdAtMs: new Date(2026, 11, 10, 20, 0, 0).getTime(),
    status: 'pago',
    ...overrides,
  };
}

test('normalizes promoter codes stripping accents, spaces, and punctuation', () => {
  assert.equal(normalizePromoterCode('Júlio Cesar!'), 'JULIOCESAR');
  assert.equal(normalizePromoterCode('  fernando-01 '), 'FERNANDO01');
});

test('enforces unique promoter codes on create while allowing editing same promoter', () => {
  const dup = validatePromoterInput({ name: 'Outro Julio', code: 'júlio' }, basePromoters);
  assert.equal(dup.valid, false);
  assert.ok(dup.error?.includes('JULIO'));

  const editSelf = validatePromoterInput(
    { name: 'Julio Oficial', code: 'JULIO' },
    basePromoters,
    'prom_julio'
  );
  assert.equal(editSelf.valid, true);

  const validNew = validatePromoterInput({ name: 'Pedro', code: 'pedro' }, basePromoters);
  assert.equal(validNew.valid, true);
  assert.equal(validNew.cleanCode, 'PEDRO');
});

test('maps Mercado Pago statuses strictly: only approved becomes pago', () => {
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('approved'), 'pago');
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('pending'), 'aguardando-pagamento');
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('in_process'), 'aguardando-pagamento');
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('cancelled'), 'cancelado');
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('rejected'), 'cancelado');
  assert.equal(mapMercadoPagoRawStatusToTicketStatus('refunded'), 'cancelado');
});

test('deduplicates orders by ticketCode and mpPaymentId to prevent double-counting', () => {
  const orders = [
    makeOrder({ ticketCode: 'HZ-111111', mpPaymentId: 'mp_100' }),
    makeOrder({ ticketCode: 'HZ-111111', mpPaymentId: 'mp_100' }),
    makeOrder({ ticketCode: 'HZ-222222', mpPaymentId: 'mp_100' }),
    makeOrder({ ticketCode: 'HZ-333333', mpPaymentId: 'mp_200' }),
  ];
  const deduped = deduplicateTicketOrders(orders);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].ticketCode, 'HZ-111111');
  assert.equal(deduped[1].ticketCode, 'HZ-333333');
});

test('counts ONLY paid/validated tickets & revenue, ranks by paid tickets, and preserves deleted promoters history', () => {
  const orders: TicketReservation[] = [
    // Fernando: 4 paid tickets (2 pago + 2 validado) -> Rank 1
    makeOrder({
      ticketCode: 'HZ-F00001',
      mpPaymentId: 'mp_f1',
      quantity: 2,
      totalCents: 4400,
      status: 'pago',
      promoterId: 'prom_fernando',
      promoterName: 'Fernando',
      promoterCode: 'FERNANDO',
    }),
    makeOrder({
      ticketCode: 'HZ-F00002',
      mpPaymentId: 'mp_f2',
      quantity: 2,
      totalCents: 3300,
      status: 'validado',
      promoterId: 'prom_fernando',
      promoterName: 'Fernando',
      promoterCode: 'FERNANDO',
    }),
    // Julio: 1 paid ticket, 1 pending (5 tickets - MUST NOT count as paid!), 1 cancelled
    makeOrder({
      ticketCode: 'HZ-J00001',
      mpPaymentId: 'mp_j1',
      quantity: 1,
      totalCents: 2200,
      status: 'pago',
      promoterId: 'prom_julio',
      promoterName: 'Julio',
      promoterCode: 'JULIO',
    }),
    makeOrder({
      ticketCode: 'HZ-J00002',
      mpPaymentId: 'mp_j2',
      quantity: 5,
      totalCents: 11000,
      status: 'aguardando-pagamento',
      promoterId: 'prom_julio',
      promoterName: 'Julio',
      promoterCode: 'JULIO',
    }),
    makeOrder({
      ticketCode: 'HZ-J00003',
      mpPaymentId: 'mp_j3',
      quantity: 2,
      totalCents: 4400,
      status: 'cancelado',
      promoterId: 'prom_julio',
      promoterName: 'Julio',
      promoterCode: 'JULIO',
    }),
    // Deleted promoter Pedro: 3 paid tickets -> Rank 2 (history preserved!)
    makeOrder({
      ticketCode: 'HZ-P00001',
      mpPaymentId: 'mp_p1',
      quantity: 3,
      totalCents: 6600,
      status: 'pago',
      promoterId: 'prom_pedro_deleted',
      promoterName: 'Pedro',
      promoterCode: 'PEDRO',
    }),
  ];

  const ranked = computeRankedPromoterStats(basePromoters, orders);

  assert.equal(ranked.length, 4);
  // 1st: Fernando (4 paid tickets)
  assert.equal(ranked[0].code, 'FERNANDO');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].paidTicketsCount, 4);
  assert.equal(ranked[0].totalRevenueCents, 7700);
  // 2nd: Pedro (deleted promoter preserved with 3 paid tickets!)
  assert.equal(ranked[1].code, 'PEDRO');
  assert.equal(ranked[1].isDeleted, true);
  assert.equal(ranked[1].paidTicketsCount, 3);
  assert.equal(ranked[1].totalRevenueCents, 6600);
  // 3rd: Julio (only 1 paid ticket; pending and cancelled tracked separately, NOT counted in paid or revenue)
  assert.equal(ranked[2].code, 'JULIO');
  assert.equal(ranked[2].ordersCount, 3);
  assert.equal(ranked[2].paidTicketsCount, 1);
  assert.equal(ranked[2].pendingPaymentsCount, 1);
  assert.equal(ranked[2].cancelledPaymentsCount, 1);
  assert.equal(ranked[2].totalRevenueCents, 2200);
  // 4th: Gustavo (inactive, 0 sales)
  assert.equal(ranked[3].code, 'GUSTAVO');
  assert.equal(ranked[3].paidTicketsCount, 0);
});

test('filters promoter orders accurately by period preset and custom date range', () => {
  const now = new Date(2026, 11, 12, 18, 0, 0);
  const orders = [
    makeOrder({
      ticketCode: 'HZ-TODAY1',
      mpPaymentId: 'mp_t1',
      createdAtMs: new Date(2026, 11, 12, 12, 0, 0).getTime(),
    }),
    makeOrder({
      ticketCode: 'HZ-OLD001',
      mpPaymentId: 'mp_o1',
      createdAtMs: new Date(2026, 10, 1, 12, 0, 0).getTime(),
    }),
  ];

  assert.equal(filterReservationsByPeriod(orders, { preset: 'hoje' }, now).length, 1);
  assert.equal(filterReservationsByPeriod(orders, { preset: '7d' }, now).length, 1);
  assert.equal(filterReservationsByPeriod(orders, { preset: 'todos' }, now).length, 2);
  assert.equal(
    filterReservationsByPeriod(
      orders,
      { preset: 'personalizado', startDate: '2026-11-01', endDate: '2026-11-15' },
      now
    ).length,
    1
  );
});
