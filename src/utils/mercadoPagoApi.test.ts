import test from 'node:test';
import assert from 'node:assert/strict';
import { routeApiRequest } from './mercadoPagoApi';

test('GET /api/payments/config reflects MERCADO_PAGO_ACCESS_TOKEN presence', async () => {
  const resUnset = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/payments/config'),
    {}
  );
  assert.equal(resUnset.status, 200);
  assert.deepEqual(await resUnset.json(), {
    configured: false,
    provider: 'mercadopago',
  });

  const resSet = await routeApiRequest(
    new Request('https://hzparty.netlify.app/.netlify/functions/api/payments/config'),
    { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-TOKEN-123' }
  );
  assert.equal(resSet.status, 200);
  assert.deepEqual(await resSet.json(), {
    configured: true,
    provider: 'mercadopago',
  });
});

test('POST /api/payments/pix validates input and calls Mercado Pago with server-authoritative amount', async () => {
  const resNoToken = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/payments/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holderName: 'Lucas Silva',
        whatsapp: '(43) 99858-9976',
        ticketCode: 'HZ-AB12CD',
        items: [{ id: 'ingresso-mulher', quantity: 1 }],
      }),
    }),
    {}
  );
  assert.equal(resNoToken.status, 503);

  const capturedPayloads: Record<string, unknown>[] = [];
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedPayloads.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        id: 987654321,
        status: 'pending',
        point_of_interaction: {
          transaction_data: {
            qr_code: '000201PIXCODE',
            qr_code_base64: 'BASE64DATA',
          },
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const resOk = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/payments/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holderName: 'Lucas Silva',
        whatsapp: '(43) 99858-9976',
        ticketCode: 'HZ-AB12CD',
        items: [{ id: 'ingresso-mulher', quantity: 1 }],
      }),
    }),
    {
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-TOKEN-123',
      URL: 'https://hzparty.netlify.app',
    },
    mockFetch
  );

  assert.equal(resOk.status, 201);
  const data = (await resOk.json()) as Record<string, unknown>;
  assert.equal(data.paymentId, '987654321');
  assert.equal(data.totalCents, 1650);
  assert.equal(data.qrCode, '000201PIXCODE');
  assert.equal(capturedPayloads[0]?.transaction_amount, 16.5);
  assert.equal(
    capturedPayloads[0]?.notification_url,
    'https://hzparty.netlify.app/api/webhooks/mercadopago'
  );
});

test('GET /api/payments/:paymentId validates ID format and normalizes approved status', async () => {
  const badRes = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/payments/bad!id'),
    { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-TOKEN-123' }
  );
  assert.equal(badRes.status, 400);

  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'approved',
        status_detail: 'accredited',
        external_reference: 'HZ-AB12CD',
        transaction_amount: 16.5,
        date_approved: '2026-11-23T20:00:00Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  const okRes = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/payments/987654321'),
    { MERCADO_PAGO_ACCESS_TOKEN: 'TEST-TOKEN-123' },
    mockFetch
  );
  assert.equal(okRes.status, 200);
  const json = (await okRes.json()) as Record<string, unknown>;
  assert.equal(json.normalizedStatus, 'pago');
  assert.equal(json.externalReference, 'HZ-AB12CD');
});

test('POST /api/webhooks/mercadopago returns 200 received', async () => {
  const res = await routeApiRequest(
    new Request('https://hzparty.netlify.app/api/webhooks/mercadopago?id=12345', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { id: '12345' } }),
    }),
    {}
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
});
