import {
  buildMercadoPagoPixPayload,
  computeAuthoritativeOrder,
  normalizeMercadoPagoStatus,
  type RequestedTicketItem,
} from './mercadoPago.ts';

export interface ApiJsonResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ApiEnv {
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  APP_URL?: string;
  URL?: string;
  DEPLOY_PRIME_URL?: string;
  [key: string]: string | undefined;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function getMpAccessToken(env: ApiEnv): string {
  return (env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
}

function getTrustedNotificationUrl(env: ApiEnv): string | undefined {
  const rawBase = (env.APP_URL || env.URL || env.DEPLOY_PRIME_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!rawBase.startsWith('https://')) {
    return undefined;
  }
  return `${rawBase}/api/webhooks/mercadopago`;
}

async function fetchMercadoPagoPayment(
  paymentId: string,
  accessToken: string,
  fetchImpl: typeof fetch
): Promise<{
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  errorMessage?: string;
}> {
  const response = await fetchImpl(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorMessage:
        typeof json.message === 'string'
          ? json.message
          : 'Erro ao consultar pagamento no Mercado Pago.',
    };
  }

  return { ok: true, status: response.status, data: json };
}

export function handlePaymentsConfig(env: ApiEnv): ApiJsonResult {
  return {
    status: 200,
    body: {
      configured: Boolean(getMpAccessToken(env)),
      provider: 'mercadopago',
    },
  };
}

export async function handleCreatePixPayment(
  body: unknown,
  env: ApiEnv,
  fetchImpl: typeof fetch = fetch
): Promise<ApiJsonResult> {
  const accessToken = getMpAccessToken(env);
  if (!accessToken) {
    return {
      status: 503,
      body: {
        error: 'MERCADO_PAGO_NOT_CONFIGURED',
        message:
          'Configure a variável secreta MERCADO_PAGO_ACCESS_TOKEN nas variáveis de ambiente do servidor para gerar cobranças Pix reais no Mercado Pago.',
      },
    };
  }

  const payload =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const holderName =
    typeof payload.holderName === 'string' ? payload.holderName.trim() : '';
  const whatsappDigits =
    typeof payload.whatsapp === 'string'
      ? payload.whatsapp.replace(/\D/g, '')
      : '';
  const ticketCode =
    typeof payload.ticketCode === 'string'
      ? payload.ticketCode.trim().toUpperCase()
      : '';

  if (holderName.length < 3 || holderName.length > 120) {
    return { status: 400, body: { message: 'Nome do titular inválido.' } };
  }
  if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
    return { status: 400, body: { message: 'WhatsApp inválido.' } };
  }
  if (!/^HZ-[A-Z0-9]{6}$/.test(ticketCode)) {
    return { status: 400, body: { message: 'Código de ingresso inválido.' } };
  }

  const items = Array.isArray(payload.items)
    ? (payload.items as RequestedTicketItem[])
    : [];
  const order = computeAuthoritativeOrder(items);
  if (!order.valid) {
    return {
      status: 400,
      body: { message: order.error || 'Pedido inválido.' },
    };
  }

  const notificationUrl = getTrustedNotificationUrl(env);
  const mpPayload = buildMercadoPagoPixPayload({
    totalCents: order.totalCents,
    ticketCode,
    holderName,
    notificationUrl,
  });

  try {
    const mpResponse = await fetchImpl('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': ticketCode,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = (await mpResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!mpResponse.ok) {
      return {
        status: mpResponse.status,
        body: {
          error: 'MERCADO_PAGO_API_ERROR',
          message:
            typeof mpData.message === 'string'
              ? mpData.message
              : 'Falha ao criar pagamento Pix no Mercado Pago.',
        },
      };
    }

    const poi = mpData.point_of_interaction as
      | {
          transaction_data?: {
            qr_code?: string;
            qr_code_base64?: string;
            ticket_url?: string;
          };
        }
      | undefined;

    const paymentId = String(mpData.id ?? '');
    const status = typeof mpData.status === 'string' ? mpData.status : 'pending';
    const qrCode = poi?.transaction_data?.qr_code ?? '';

    return {
      status: 201,
      body: {
        paymentId,
        status,
        normalizedStatus: normalizeMercadoPagoStatus(status),
        qrCode,
        qrCodeBase64: poi?.transaction_data?.qr_code_base64,
        ticketUrl: poi?.transaction_data?.ticket_url,
        dateOfExpiration:
          typeof mpData.date_of_expiration === 'string'
            ? mpData.date_of_expiration
            : undefined,
        totalCents: order.totalCents,
        tierSummary: order.tierSummary,
        totalQuantity: order.totalQuantity,
      },
    };
  } catch (error) {
    console.error('Mercado Pago Pix creation error:', error);
    return {
      status: 502,
      body: {
        error: 'MERCADO_PAGO_NETWORK_ERROR',
        message: 'Não foi possível conectar à API do Mercado Pago.',
      },
    };
  }
}

export async function handleCheckPaymentStatus(
  rawPaymentId: string,
  env: ApiEnv,
  fetchImpl: typeof fetch = fetch
): Promise<ApiJsonResult> {
  const paymentId = rawPaymentId.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(paymentId)) {
    return { status: 400, body: { message: 'ID de pagamento inválido.' } };
  }

  const accessToken = getMpAccessToken(env);
  if (!accessToken) {
    return {
      status: 503,
      body: {
        error: 'MERCADO_PAGO_NOT_CONFIGURED',
        message: 'MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor.',
      },
    };
  }

  try {
    const result = await fetchMercadoPagoPayment(
      paymentId,
      accessToken,
      fetchImpl
    );
    if (!result.ok || !result.data) {
      return { status: result.status, body: { message: result.errorMessage } };
    }

    const status =
      typeof result.data.status === 'string' ? result.data.status : 'pending';
    const statusDetail =
      typeof result.data.status_detail === 'string'
        ? result.data.status_detail
        : '';
    const externalReference =
      typeof result.data.external_reference === 'string'
        ? result.data.external_reference
        : '';
    const transactionAmount = Number(result.data.transaction_amount ?? 0);
    const dateApproved =
      typeof result.data.date_approved === 'string'
        ? result.data.date_approved
        : null;

    return {
      status: 200,
      body: {
        paymentId,
        status,
        statusDetail,
        normalizedStatus: normalizeMercadoPagoStatus(status),
        externalReference,
        transactionAmount,
        dateApproved,
      },
    };
  } catch (error) {
    console.error('Mercado Pago status check error:', error);
    return {
      status: 502,
      body: { message: 'Falha ao consultar Mercado Pago.' },
    };
  }
}

export async function handleMercadoPagoWebhook(
  body: unknown,
  queryPaymentId: string | undefined,
  env: ApiEnv,
  fetchImpl: typeof fetch = fetch
): Promise<ApiJsonResult> {
  const parsedBody =
    body && typeof body === 'object'
      ? (body as { data?: { id?: string | number } })
      : {};
  const rawId = parsedBody.data?.id ?? queryPaymentId;
  const paymentId = rawId !== undefined ? String(rawId).trim() : '';

  const accessToken = getMpAccessToken(env);
  if (accessToken && /^[a-zA-Z0-9_-]{1,64}$/.test(paymentId)) {
    try {
      await fetchMercadoPagoPayment(paymentId, accessToken, fetchImpl);
    } catch (err) {
      console.error('Webhook verification failed:', err);
    }
  }

  return { status: 200, body: { received: true } };
}

function normalizeApiSubpath(pathname: string): string {
  const stripped = pathname
    .replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '')
    .replace(/^\/api(?=\/|$)/, '');
  const clean = stripped.replace(/\/+$/, '');
  return clean || '/';
}

function jsonResponse(result: ApiJsonResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: JSON_HEADERS,
  });
}

export async function routeApiRequest(
  req: Request,
  env: ApiEnv,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const url = new URL(req.url);
  const subpath = normalizeApiSubpath(url.pathname);
  const method = req.method.toUpperCase();

  if (method === 'GET' && subpath === '/health') {
    return jsonResponse({
      status: 200,
      body: { ok: true, service: 'hz-party-server' },
    });
  }

  if (method === 'GET' && subpath === '/payments/config') {
    return jsonResponse(handlePaymentsConfig(env));
  }

  if (method === 'POST' && subpath === '/payments/pix') {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonResponse({
        status: 400,
        body: { message: 'Corpo JSON inválido.' },
      });
    }
    return jsonResponse(await handleCreatePixPayment(body, env, fetchImpl));
  }

  if (method === 'POST' && subpath === '/webhooks/mercadopago') {
    const body = await req.json().catch(() => ({}));
    const queryId =
      url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? undefined;
    return jsonResponse(
      await handleMercadoPagoWebhook(body, queryId, env, fetchImpl)
    );
  }

  if (method === 'GET' && subpath.startsWith('/payments/')) {
    const rawSegment = subpath.slice('/payments/'.length);
    if (rawSegment && !rawSegment.includes('/')) {
      let paymentId = '';
      try {
        paymentId = decodeURIComponent(rawSegment);
      } catch {
        return jsonResponse({
          status: 400,
          body: { message: 'ID de pagamento inválido.' },
        });
      }
      return jsonResponse(
        await handleCheckPaymentStatus(paymentId, env, fetchImpl)
      );
    }
  }

  return jsonResponse({
    status: 404,
    body: { message: 'Rota de API não encontrada.' },
  });
}
