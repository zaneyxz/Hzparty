import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Menu, MessageCircle, X } from 'lucide-react';
import { SUPPORT_WHATSAPP_CONTACTS } from '../data/events';
import type { PageRoute } from '../types/hz';

interface HeaderProps {
  currentPage: PageRoute;
  onNavigate: (page: PageRoute) => void;
}

const NAV_ITEMS: { id: PageRoute; label: string }[] = [
  { id: 'home', label: 'Início' },
  { id: 'pre-lista', label: 'Lista' },
  { id: 'ingressos', label: 'Ingressos' },
  { id: 'meu-ingresso', label: 'Meu Ingresso' },
  { id: 'admin', label: 'Administração' },
];

export function Header({ currentPage, onNavigate }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const supportContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supportOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        supportContainerRef.current &&
        !supportContainerRef.current.contains(event.target as Node)
      ) {
        setSupportOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSupportOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [supportOpen]);

  const handleNav = (page: PageRoute) => {
    onNavigate(page);
    setMobileOpen(false);
    setSupportOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050507]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:gap-8">
        {/* Zone 1: Single-line Brand Wordmark + Official Logo */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="flex items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D38] whitespace-nowrap shrink-0"
        >
          <img
            src="/assets/aistudio/hz_party_icon_eebb473c.png"
            alt="Logo oficial HZ PARTY"
            referrerPolicy="no-referrer"
            className="h-9 w-9 rounded-full border border-[#DC143C]/40 object-cover"
          />
          <span className="font-display text-2xl font-extrabold tracking-[0.08em] text-white uppercase whitespace-nowrap shrink-0">
            HZ PARTY
          </span>
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Navegação principal"
          className="hidden md:flex items-center gap-5 lg:gap-6"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D38] ${
                  isActive
                    ? 'text-white'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 bottom-0 left-0 h-[2px] bg-[#E11D38]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary CTA + Top-Right WhatsApp Support Button + Mobile menu trigger */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('ingressos')}
            className="hz-crimson-button hidden min-h-[40px] items-center justify-center rounded-md px-4 py-2 text-xs font-bold tracking-[0.08em] text-white uppercase sm:inline-flex whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Comprar Ingresso
          </button>

          {/* Top-right WhatsApp Support Trigger & Popover */}
          <div ref={supportContainerRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setSupportOpen((prev) => !prev);
                setMobileOpen(false);
              }}
              aria-expanded={supportOpen}
              aria-haspopup="dialog"
              aria-controls="whatsapp-support-popover"
              aria-label="Suporte no WhatsApp"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-emerald-500/45 bg-emerald-500/12 px-3 py-2 text-xs font-bold tracking-[0.06em] text-emerald-300 uppercase transition-colors hover:border-emerald-400 hover:bg-emerald-500/20 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-3.5"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-[#25D366]" aria-hidden="true" />
              <span>Suporte</span>
            </button>

            {supportOpen && (
              <div
                id="whatsapp-support-popover"
                role="dialog"
                aria-label="Contatos de suporte via WhatsApp"
                data-testid="whatsapp-support-popover"
                className="absolute right-0 mt-2 w-[min(calc(100vw-2rem),310px)] rounded-xl border border-white/15 bg-[#0B0B10] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.75)] z-50"
              >
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.12em] text-[#25D366] uppercase">
                      WhatsApp de Suporte
                    </p>
                    <p className="mt-0.5 text-xs text-[#9CA3AF]">
                      Fale diretamente com a organização da HZ PARTY
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSupportOpen(false)}
                    aria-label="Fechar suporte"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9CA3AF] transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {SUPPORT_WHATSAPP_CONTACTS.map((contact) => (
                    <li key={contact.id}>
                      <a
                        href={contact.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#050507] px-3.5 py-2.5 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[#25D366]">
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">
                              {contact.name}
                            </p>
                            <p className="font-mono text-xs text-[#C7CBD4] tabular-nums">
                              {contact.phoneDisplay}
                            </p>
                          </div>
                        </div>
                        <ExternalLink
                          className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]"
                          aria-hidden="true"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileOpen((prev) => !prev);
              setSupportOpen(false);
            }}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-white/10 bg-[#0D0D11] text-white transition-colors hover:border-[#DC143C]/50 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Menu móvel"
          className="border-t border-white/10 bg-[#09090D] px-4 py-4 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#E11D38]/15 text-white'
                      : 'text-[#C7CBD4] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="text-xs font-semibold text-[#E11D38]">
                      Ativo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => handleNav('ingressos')}
              className="hz-crimson-button flex min-h-[44px] w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-bold tracking-wider text-white uppercase"
            >
              Comprar Ingresso
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
