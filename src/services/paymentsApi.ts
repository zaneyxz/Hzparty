import type { PixPaymentCreationResult, TicketStatus } from '../types/hz';

export interface MercadoPagoConfigStatus {
  configured: boolean;
  provider: 'mercadopago';
}

export interface MercadoPagoStatusResponse {
  paymentId: string;
  status: string;
  statusDetail: string;
  normalizedStatus: TicketStatus;
  externalReference: string;
  transactionAmount: number;
  dateApproved: string | null;
}

export async function fetchMercadoPagoConfig(): Promise<MercadoPagoConfigStatus> {
  const res = await fetch('/api/payments/config');
  if (!res.ok) {
    throw new Error('Não foi possível verificar a configuração do Mercado Pago.');
  }
  return (await res.json()) as MercadoPagoConfigStatus;
}

export async function createMercadoPagoPix(input: {
  holderName: string;
  whatsapp: string;
  ticketCode: string;
  items: { id: string; quantity: number }[];
}): Promise<PixPaymentCreationResult> {
  const res = await fetch('/api/payments/pix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
  } & Partial<PixPaymentCreationResult>;

  if (!res.ok) {
    const err = new Error(
      data.message || 'Não foi possível gerar a cobrança Pix no Mercado Pago.'
    ) as Error & { code?: string };
    err.code = data.error;
    throw err;
  }

  return data as PixPaymentCreationResult;
}

export async function checkMercadoPagoPaymentStatus(
  paymentId: string
): Promise<MercadoPagoStatusResponse> {
  const res = await fetch(`/api/payments/${encodeURIComponent(paymentId)}`);
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
  } & Partial<MercadoPagoStatusResponse>;
  if (!res.ok) {
    throw new Error(data.message || 'Erro ao consultar status no Mercado Pago.');
  }
  return data as MercadoPagoStatusResponse;
}
