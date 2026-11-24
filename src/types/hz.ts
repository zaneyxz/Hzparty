export type PageRoute =
  | 'home'
  | 'pre-lista'
  | 'ingressos'
  | 'meu-ingresso'
  | 'admin';

export interface EventEdition {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
  timeRange: string;
  venue: string;
  city: string;
  status: 'proximo' | 'em-breve' | 'rascunho';
  capacityLabel: string;
  ageRating: string;
  dressCode: string;
  lineupHighlights: string[];
}

export interface TicketBatch {
  id: string;
  name: string;
  tierLabel: string;
  batchLabel: string;
  priceCents: number;
  status: 'disponivel' | 'ultimos' | 'em-breve';
  perks: string[];
  maxPerOrder: number;
}

export interface PreListEntry {
  id: string;
  protocol: string;
  fullName: string;
  whatsapp: string;
  modality: 'lista';
  eventTitle: string;
  createdAt: string;
  status: 'aguardando' | 'confirmado';
}

export interface PublicGuestListEntry {
  id: string;
  protocol: string;
  fullName: string;
  eventTitle: string;
  createdAt: string;
  status: 'aguardando' | 'confirmado';
}

export type TicketStatus = 'aguardando-pagamento' | 'pago' | 'validado';

export interface TicketReservation {
  id: string;
  ticketCode: string;
  holderName: string;
  displayName?: string;
  whatsapp: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  tierName: string;
  quantity: number;
  totalCents: number;
  mpPaymentId: string;
  createdAt: string;
  status: TicketStatus;
  validatedAt?: string;
}

export interface PixPaymentCreationResult {
  paymentId: string;
  status: string;
  normalizedStatus: TicketStatus;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  dateOfExpiration?: string;
  totalCents: number;
  tierSummary: string;
  totalQuantity: number;
}
