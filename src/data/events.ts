import type { EventEdition, TicketBatch } from '../types/hz';

export const PARTY_WHATSAPP_GROUPS = [
  {
    id: 'grupo-1',
    title: 'Grupo 1 — Principal',
    subtitle: 'Grupo oficial da festa no WhatsApp',
    href: 'https://chat.whatsapp.com/JZQ4q5uAda1CPf9wi8W3W9?s=cl&p=i&iam=2',
  },
  {
    id: 'grupo-2',
    title: 'Grupo 2 — Alternativo',
    subtitle: 'Entre aqui se o Grupo 1 estiver lotado',
    href: 'https://chat.whatsapp.com/Fph0im1Ttbk85jzuaHByqL?s=cl&p=i&iam=2',
  },
] as const;

export interface SupportWhatsAppContact {
  id: string;
  name: string;
  phoneDisplay: string;
  phoneRaw: string;
  href: string;
}

const SUPPORT_WHATSAPP_MESSAGE = encodeURIComponent(
  'Olá! Preciso de suporte sobre a HZ PARTY (12/12).'
);

export const SUPPORT_WHATSAPP_CONTACTS: SupportWhatsAppContact[] = [
  {
    id: 'zanetti',
    name: 'Zanetti',
    phoneDisplay: '(43) 99858-9976',
    phoneRaw: '43998589976',
    href: `https://wa.me/5543998589976?text=${SUPPORT_WHATSAPP_MESSAGE}`,
  },
  {
    id: 'rafa',
    name: 'Rafa',
    phoneDisplay: '(43) 9912-1806',
    phoneRaw: '4399121806',
    href: `https://wa.me/554399121806?text=${SUPPORT_WHATSAPP_MESSAGE}`,
  },
  {
    id: 'giovanni',
    name: 'Giovanni',
    phoneDisplay: '(43) 9699-0188',
    phoneRaw: '4396990188',
    href: `https://wa.me/554396990188?text=${SUPPORT_WHATSAPP_MESSAGE}`,
  },
];

export const EVENT_LOCATION = {
  venueName: 'Espaço de Lazer Alto da Gávea',
  venueLabel: 'Chácara: Espaço de Lazer Alto da Gávea',
  address: 'Rua Luiz Ferrari, 776, em Londrina (região do Heimtal / Jardim Leblon)',
  shortAddress: 'Rua Luiz Ferrari, 776 · Londrina (Heimtal / Jardim Leblon)',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Rua+Luiz+Ferrari+776+Londrina+PR',
} as const;

export const INITIAL_EVENTS: EventEdition[] = [
  {
    id: 'hz-dec-12',
    title: 'HZ PARTY — Edição Principal',
    subtitle:
      'A HZ PARTY foi preparada para proporcionar uma experiência única de entretenimento, música e diversão em um ambiente exclusivo.',
    dateLabel: '12 de Dezembro',
    timeRange: '22:30 às 05:00',
    venue: 'Chácara: Espaço de Lazer Alto da Gávea',
    city: 'Rua Luiz Ferrari, 776 · Londrina (Heimtal / Jardim Leblon)',
    status: 'proximo',
    capacityLabel: 'Classificação +18',
    ageRating: 'Venda de bebidas somente para +18',
    dressCode: 'Livre',
    lineupHighlights: [
      'Som de alta qualidade e DJs qualificados',
      'Carro de som até às 05:00',
      'Segurança presente até o final da festa',
    ],
  },
];

export const INITIAL_TICKET_BATCHES: TicketBatch[] = [
  {
    id: 'ingresso-mulher',
    name: 'Ingresso Mulher',
    tierLabel: 'Entrada individual feminina · 12 de Dezembro',
    batchLabel: 'Mulher',
    priceCents: 1500,
    status: 'disponivel',
    perks: [
      'Acesso completo à resenha em chácara das 22:30 às 05:00',
      'Segurança presente até o final da festa',
    ],
    maxPerOrder: 6,
  },
  {
    id: 'ingresso-homem',
    name: 'Ingresso Homem',
    tierLabel: 'Entrada individual masculina · 12 de Dezembro',
    batchLabel: 'Homem',
    priceCents: 2000,
    status: 'disponivel',
    perks: [
      'Acesso completo à resenha em chácara das 22:30 às 05:00',
      'Segurança presente até o final da festa',
    ],
    maxPerOrder: 6,
  },
  {
    id: 'ingresso-teste-1real',
    name: 'Ingresso de Teste',
    tierLabel: 'Ingresso de teste para validação do sistema Pix, Promoters e QR Code',
    batchLabel: 'Teste',
    priceCents: 100,
    status: 'disponivel',
    perks: [
      'Exclusivo para testar o checkout Mercado Pago e validação de QR Code',
    ],
    maxPerOrder: 2,
  },
];
