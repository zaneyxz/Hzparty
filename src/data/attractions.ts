import type { ConfirmedAttraction } from '../types/hz';

/**
 * Lista de atrações confirmadas da HZ PARTY.
 * Para adicionar novos DJs ou artistas no futuro, basta incluir um novo item neste array.
 * A seção "Atrações Confirmadas" adapta o layout automaticamente para 1 ou vários artistas.
 */
export const CONFIRMED_ATTRACTIONS: ConfirmedAttraction[] = [
  {
    id: 'fabinho-deejhay',
    name: 'FABINHO DEEJHAY',
    role: 'DJ Convidado · Line-up Oficial',
    status: 'confirmado',
    statusLabel: 'ATRAÇÃO CONFIRMADA',
    badgeLabel: 'CONFIRMADO',
    schedule: '01:30 às 04:00',
    eventDate: '12/12',
    imageUrl: '/assets/aistudio/Cartaz_Gritty_da_HZ_Party_fdadce4c.png',
    imageAlt: 'Cartaz oficial de Fabinho Deejhay confirmado na HZ PARTY',
  },
];
