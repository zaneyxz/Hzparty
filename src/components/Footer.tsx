import { ExternalLink, MapPin, MessageCircle } from 'lucide-react';
import { EVENT_LOCATION, PARTY_WHATSAPP_GROUPS } from '../data/events';
import type { PageRoute } from '../types/hz';

interface FooterProps {
  onNavigate: (page: PageRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-white/10 bg-[#050507] text-[#9CA3AF]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand Summary */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/hz_party_icon_eebb473c.png"
                alt="HZ PARTY"
                referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-full border border-[#DC143C]/40 object-cover"
              />
              <div>
                <p className="font-display text-2xl font-extrabold tracking-[0.08em] text-white uppercase">
                  HZ PARTY
                </p>
                <p className="text-xs text-[#9CA3AF]">
                  Edição 12 de Dezembro · 22:30 às 05:00
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#9CA3AF]">
              Som de alta qualidade e DJs qualificados.
            </p>
            <div className="mt-3 flex items-start gap-2 text-xs text-[#B4B9C4]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E11D38]" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">{EVENT_LOCATION.venueLabel}</p>
                <p className="mt-0.5 text-[#9CA3AF]">{EVENT_LOCATION.address}</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">
              Navegação
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="transition-colors hover:text-white"
                >
                  Início
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('pre-lista')}
                  className="transition-colors hover:text-white"
                >
                  Adicionar Nome na Lista
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('ingressos')}
                  className="transition-colors hover:text-white"
                >
                  Ingressos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('meu-ingresso')}
                  className="transition-colors hover:text-white"
                >
                  Consultar Meu Ingresso
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="transition-colors hover:text-white"
                >
                  Área Administrativa
                </button>
              </li>
            </ul>
          </div>

          {/* Party WhatsApp Groups */}
          <div className="md:col-span-4">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">
              Grupos da Festa
            </h2>
            <div className="mt-4 space-y-2.5">
              {PARTY_WHATSAPP_GROUPS.map((group) => (
                <a
                  key={group.id}
                  href={group.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-md border border-white/10 bg-[#0B0B0F] px-3.5 py-2.5 text-sm text-[#D1D5DB] transition-colors hover:border-[#E11D38]/50 hover:text-white"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MessageCircle
                      className="h-4 w-4 shrink-0 text-[#E11D38]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {group.title}
                      </p>
                      <p className="truncate text-[11px] text-[#9CA3AF]">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]"
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-[#71717A] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} HZ PARTY. Todos os direitos reservados.</p>
          <p>
            Próximo evento: 12 de Dezembro · 22:30 às 05:00 · {EVENT_LOCATION.venueName} (Londrina) · Venda de bebidas
            somente para +18
          </p>
        </div>
      </div>
    </footer>
  );
}
