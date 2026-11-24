import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVisualPixPreviewString,
  calculateOrderSummary,
  formatWhatsAppInput,
  generateVisualCode,
  isValidWhatsApp,
  lookupTicketReservation,
} from './ticketing';
import { buildQrMatrix } from './qrMatrix';
import type { TicketBatch, TicketReservation } from '../types/hz';

const sampleBatches: TicketBatch[] = [
  {
    id: 'a',
    name: 'Pista',
    tierLabel: 'Geral',
    batchLabel: '1º Lote',
    priceCents: 6000,
    status: 'disponivel',
    perks: [],
    maxPerOrder: 4,
  },
  {
    id: 'b',
    name: 'Pista',
    tierLabel: 'Futuro',
    batchLabel: '2º Lote',
    priceCents: 8000,
    status: 'em-breve',
    perks: [],
    maxPerOrder: 4,
  },
];

test('calculates subtotal, 10% fee, and total ignoring em-breve batches', () => {
  const summary = calculateOrderSummary(sampleBatches, { a: 2, b: 3 });
  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalCents, 12000);
  assert.equal(summary.serviceFeeCents, 1200);
  assert.equal(summary.totalCents, 13200);
});

test('calculates 15 Mulher + 20 Homem ticket combination accurately', () => {
  const genderBatches: TicketBatch[] = [
    {
      id: 'ingresso-mulher',
      name: 'Ingresso Mulher',
      tierLabel: 'Mulher',
      batchLabel: 'Mulher',
      priceCents: 1500,
      status: 'disponivel',
      perks: [],
      maxPerOrder: 6,
    },
    {
      id: 'ingresso-homem',
      name: 'Ingresso Homem',
      tierLabel: 'Homem',
      batchLabel: 'Homem',
      priceCents: 2000,
      status: 'disponivel',
      perks: [],
      maxPerOrder: 6,
    },
  ];
  const summary = calculateOrderSummary(genderBatches, {
    'ingresso-mulher': 1,
    'ingresso-homem': 1,
  });
  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalCents, 3500);
  assert.equal(summary.serviceFeeCents, 350);
  assert.equal(summary.totalCents, 3850);
});

test('clamps ticket quantity to batch maxPerOrder', () => {
  const summary = calculateOrderSummary(sampleBatches, { a: 99 });
  assert.equal(summary.totalQuantity, 4);
  assert.equal(summary.subtotalCents, 24000);
});

test('formats and validates Brazilian WhatsApp phone numbers', () => {
  assert.equal(formatWhatsAppInput('11987654321'), '(11) 98765-4321');
  assert.equal(formatWhatsAppInput('1132654321'), '(11) 3265-4321');
  assert.equal(isValidWhatsApp('(11) 98765-4321'), true);
  assert.equal(isValidWhatsApp('11999'), false);
});

test('generates deterministic visual codes and Pix preview string', () => {
  const code = generateVisualCode('HZ', 'seed-1');
  assert.match(code, /^HZ-[A-Z0-9]{6}$/);
  assert.equal(code, generateVisualCode('HZ', 'seed-1'));

  const pix = buildVisualPixPreviewString(code, 13200);
  assert.ok(pix.includes('HZ PARTY'));
  assert.ok(pix.includes(code));
  assert.ok(pix.includes('132.00'));
});

test('looks up reservation by ticket code or WhatsApp digits', () => {
  const list: TicketReservation[] = [
    {
      id: '1',
      ticketCode: 'HZ-AB12CD',
      holderName: 'Mariana Costa',
      whatsapp: '(11) 99123-4567',
      eventTitle: 'HZ PARTY',
      eventDate: '12 de Dezembro',
      eventTime: '22:30 às 05:00',
      venue: 'Chácara: Espaço de Lazer Alto da Gávea',
      tierName: 'Pista Underground',
      quantity: 1,
      totalCents: 6600,
      mpPaymentId: 'mp-test-123',
      createdAt: '2026-11-13',
      status: 'aguardando-pagamento',
    },
  ];
  assert.equal(lookupTicketReservation(list, 'hz-ab12cd')?.holderName, 'Mariana Costa');
  assert.equal(lookupTicketReservation(list, '991234567')?.ticketCode, 'HZ-AB12CD');
  assert.equal(lookupTicketReservation(list, 'inexistente'), null);
});

test('builds deterministic 25x25 QR matrix with top-left finder pattern', () => {
  const m1 = buildQrMatrix('HZ-TEST');
  const m2 = buildQrMatrix('HZ-TEST');
  assert.equal(m1.length, 25);
  assert.equal(m1[0].length, 25);
  assert.deepEqual(m1, m2);
  // Top-left 7x7 finder corners must be dark
  assert.equal(m1[0][0], true);
  assert.equal(m1[0][6], true);
  assert.equal(m1[6][0], true);
  assert.equal(m1[3][3], true);
  assert.equal(m1[1][1], false);
});
