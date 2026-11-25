export interface RequestedTicketItem {
  id: string;
  quantity: number;
}

export interface AuthoritativeOrderLine {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface AuthoritativeOrderResult {
  valid: boolean;
  error?: string;
  lines: AuthoritativeOrderLine[];
  totalQuantity: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
  tierSummary: string;
}

const AUTHORITATIVE_CATALOG: Record<
  string,
  { name: string; priceCents: number; maxPerOrder: number }
> = {
  'ingresso-mulher': {
    name: 'Ingresso Mulher',
    priceCents: 1500,
    maxPerOrder: 6,
  },
  'ingresso-homem': {
    name: 'Ingresso Homem',
    priceCents: 2000,
    maxPerOrder: 6,
  },
  'ingresso-teste-1real': {
    name: 'Ingresso de Teste',
    priceCents: 100,
    maxPerOrder: 2,
  },
};

export function computeAuthoritativeOrder(
  items: RequestedTicketItem[]
): AuthoritativeOrderResult {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      valid: false,
      error: 'Selecione ao menos 1 ingresso válido.',
      lines: [],
      totalQuantity: 0,
      subtotalCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
      tierSummary: '',
    };
  }

  const aggregated = new Map<string, number>();
  for (const item of items) {
    const spec = AUTHORITATIVE_CATALOG[item.id];
    if (!spec) {
      return {
        valid: false,
        error: `Tipo de ingresso desconhecido: ${item.id}`,
        lines: [],
        totalQuantity: 0,
        subtotalCents: 0,
        serviceFeeCents: 0,
        totalCents: 0,
        tierSummary: '',
      };
    }
    const qty = Math.floor(Number(item.quantity) || 0);
    if (qty <= 0) continue;
    const prev = aggregated.get(item.id) ?? 0;
    aggregated.set(item.id, Math.min(spec.maxPerOrder, prev + qty));
  }

  const lines: AuthoritativeOrderLine[] = [];
  let totalQuantity = 0;
  let subtotalCents = 0;

  for (const [id, qty] of aggregated.entries()) {
    const spec = AUTHORITATIVE_CATALOG[id];
    const lineTotalCents = qty * spec.priceCents;
    lines.push({
      id,
      name: spec.name,
      quantity: qty,
      unitPriceCents: spec.priceCents,
      lineTotalCents,
    });
    totalQuantity += qty;
    subtotalCents += lineTotalCents;
  }

  if (totalQuantity <= 0 || totalQuantity > 12) {
    return {
      valid: false,
      error: 'Quantidade de ingressos fora do limite permitido (1 a 12).',
      lines: [],
      totalQuantity: 0,
      subtotalCents: 0,
      serviceFeeCents: 0,
      totalCents: 0,
      tierSummary: '',
    };
  }

  const serviceFeeCents = Math.round(subtotalCents * 0.1);
  const totalCents = subtotalCents + serviceFeeCents;
  const tierSummary = lines.map((l) => `${l.quantity}x ${l.name}`).join(' + ');

  return {
    valid: true,
    lines,
    totalQuantity,
    subtotalCents,
    serviceFeeCents,
    totalCents,
    tierSummary,
  };
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
  displayName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Convidado';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'HZPARTY';
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : '';
  const displayName = `${firstName}${lastInitial}`.slice(0, 80);
  return { firstName, lastName, displayName };
}

export function buildMercadoPagoPixPayload(params: {
  totalCents: number;
  ticketCode: string;
  holderName: string;
  notificationUrl?: string;
}) {
  const { firstName, lastName } = splitFullName(params.holderName);
  const payload: Record<string, unknown> = {
    transaction_amount: Number((params.totalCents / 100).toFixed(2)),
    description: `HZ PARTY 12/12 - Ingresso ${params.ticketCode}`,
    payment_method_id: 'pix',
    external_reference: params.ticketCode,
    payer: {
      email: 'ingressos@hzparty.com.br',
      first_name: firstName,
      last_name: lastName,
    },
  };

  if (params.notificationUrl && params.notificationUrl.startsWith('https://')) {
    payload.notification_url = params.notificationUrl;
  }

  return payload;
}

export function normalizeMercadoPagoStatus(
  mpStatus: string | undefined
): 'aguardando-pagamento' | 'pago' {
  if (mpStatus === 'approved') {
    return 'pago';
  }
  return 'aguardando-pagamento';
}
