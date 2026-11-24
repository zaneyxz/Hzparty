import type { TicketBatch, TicketReservation } from '../types/hz';

export interface OrderLineSummary {
  batchId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderSummary {
  lines: OrderLineSummary[];
  totalQuantity: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function formatWhatsAppInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidWhatsApp(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

export function calculateOrderSummary(
  batches: TicketBatch[],
  quantities: Record<string, number>
): OrderSummary {
  const lines: OrderLineSummary[] = [];
  let totalQuantity = 0;
  let subtotalCents = 0;

  for (const batch of batches) {
    if (batch.status === 'em-breve') continue;
    const rawQty = quantities[batch.id] ?? 0;
    const qty = Math.max(0, Math.min(batch.maxPerOrder, Math.floor(rawQty)));
    if (qty <= 0) continue;

    const lineTotalCents = qty * batch.priceCents;
    const displayName = batch.name.toLowerCase().includes(batch.batchLabel.toLowerCase())
      ? batch.name
      : `${batch.name} (${batch.batchLabel})`;
    lines.push({
      batchId: batch.id,
      name: displayName,
      quantity: qty,
      unitPriceCents: batch.priceCents,
      lineTotalCents,
    });
    totalQuantity += qty;
    subtotalCents += lineTotalCents;
  }

  // Visual platform convenience fee preview (10% rounded to nearest cent)
  const serviceFeeCents = Math.round(subtotalCents * 0.1);
  const totalCents = subtotalCents + serviceFeeCents;

  return {
    lines,
    totalQuantity,
    subtotalCents,
    serviceFeeCents,
    totalCents,
  };
}

export function generateVisualCode(prefix: string, seedText: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = (hash >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `${prefix}-${code}`;
}

export function buildVisualPixPreviewString(
  referenceCode: string,
  amountCents: number
): string {
  const formattedAmount = (amountCents / 100).toFixed(2);
  return `00020126360014BR.GOV.BCB.PIX0114PREVIEW-HZPARTY520400005303986540${formattedAmount.length}${formattedAmount}5802BR5908HZ PARTY6009SAO PAULO62110507${referenceCode}6304PREV`;
}

export function lookupTicketReservation(
  reservations: TicketReservation[],
  query: string
): TicketReservation | null {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return null;
  const digitsQuery = query.replace(/\D/g, '');

  return (
    reservations.find((item) => {
      if (item.ticketCode.toUpperCase() === normalized) return true;
      if (digitsQuery.length >= 6 && item.whatsapp.replace(/\D/g, '').includes(digitsQuery)) {
        return true;
      }
      return false;
    }) ?? null
  );
}
