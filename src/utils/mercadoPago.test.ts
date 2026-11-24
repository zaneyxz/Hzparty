import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMercadoPagoPixPayload,
  computeAuthoritativeOrder,
  normalizeMercadoPagoStatus,
  splitFullName,
} from './mercadoPago';

test('computes authoritative Mulher R$ 15 + Homem R$ 20 order with 10% fee', () => {
  const res = computeAuthoritativeOrder([
    { id: 'ingresso-mulher', quantity: 2 },
    { id: 'ingresso-homem', quantity: 1 },
  ]);
  assert.equal(res.valid, true);
  assert.equal(res.totalQuantity, 3);
  assert.equal(res.subtotalCents, 5000);
  assert.equal(res.serviceFeeCents, 500);
  assert.equal(res.totalCents, 5500);
  assert.equal(res.tierSummary, '2x Ingresso Mulher + 1x Ingresso Homem');
});

test('rejects unknown ticket IDs or zero quantity', () => {
  assert.equal(computeAuthoritativeOrder([]).valid, false);
  assert.equal(
    computeAuthoritativeOrder([{ id: 'vip-falso', quantity: 1 }]).valid,
    false
  );
  assert.equal(
    computeAuthoritativeOrder([{ id: 'ingresso-mulher', quantity: 0 }]).valid,
    false
  );
});

test('builds valid Mercado Pago Pix payment payload with external_reference', () => {
  const payload = buildMercadoPagoPixPayload({
    totalCents: 3850,
    ticketCode: 'HZ-AB12CD',
    holderName: 'Mariana Silva Souza',
    notificationUrl: 'https://example.run.app/api/webhooks/mercadopago',
  });
  assert.equal(payload.transaction_amount, 38.5);
  assert.equal(payload.payment_method_id, 'pix');
  assert.equal(payload.external_reference, 'HZ-AB12CD');
  assert.equal(
    payload.notification_url,
    'https://example.run.app/api/webhooks/mercadopago'
  );
});

test('splitFullName protects PII with abbreviated displayName', () => {
  const split = splitFullName('Rafael Oliveira Santos');
  assert.equal(split.firstName, 'Rafael');
  assert.equal(split.lastName, 'Oliveira Santos');
  assert.equal(split.displayName, 'Rafael S.');
});

test('normalizes Mercado Pago payment statuses accurately', () => {
  assert.equal(normalizeMercadoPagoStatus('approved'), 'pago');
  assert.equal(normalizeMercadoPagoStatus('pending'), 'aguardando-pagamento');
  assert.equal(normalizeMercadoPagoStatus('in_process'), 'aguardando-pagamento');
});

test('rejects removed R$ 1,00 test ticket ID', () => {
  const res = computeAuthoritativeOrder([
    { id: 'ingresso-teste-1real', quantity: 1 },
  ]);
  assert.equal(res.valid, false);
});
