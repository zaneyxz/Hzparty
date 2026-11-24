import { ArrowRight, Calendar, Clock, ExternalLink, MapPin, MessageCircle, Ticket } from 'lucide-react';
import { EVENT_LOCATION, PARTY_WHATSAPP_GROUPS } from '../data/events';
import type { EventEdition, PageRoute } from '../types/hz';

interface HomePageProps {
  events: EventEdition[];
  onNavigate: (page: PageRoute) => void;
}

export function HomePage({ events, onNavigate }: HomePageProps) {
  const featuredEvent = events.find((e) => e.status === 'proximo') ?? events[0];

  return (
    <div className="relative">
      {/* Hero Banner */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#050507]">
        <div
          aria-hidden="true"
          className="hz-ambient-glow pointer-events-none absolute inset-0"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-20">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Hero Editorial Copy */}
            <div className="hz-fade-up flex flex-col justify-center lg:col-span-7">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                <span>Edição Principal</span>
                <span aria-hidden="true" className="text-white/25">
                  ·
                </span>
                <span className="text-[#C7CBD4]">12 de Dezembro</span>
                <span aria-hidden="true" className="text-white/25">
                  ·
                </span>
                <span className="text-[#C7CBD4]">22:30 às 05:00</span>
              </div>

              <h1
                className="mt-4 font-display text-[clamp(2.75rem,5.2vw,4.5rem)] leading-[0.95] font-extrabold tracking-tight text-white uppercase"
                style={{ textWrap: 'balance' }}
              >
                A noite entra em alta frequência na{' '}
                <span className="hz-silver-text">HZ PARTY</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#B4B9C4] sm:text-lg">
                Resenha em chácara, espaço qualificado, segurança presente até o final
                da festa, venda de bebidas somente para +18.
              </p>

              {/* Edition Facts Bar (Unboxed Metadata) */}
              {featuredEvent && (
                <dl className="mt-7 grid grid-cols-1 gap-4 border-y border-white/10 py-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                      Data
                    </dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
                      <Calendar className="h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
                      {featuredEvent.dateLabel} (12/12)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                      Horário
                    </dt>
                    <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-white tabular-nums">
                      <Clock className="h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
                      {featuredEvent.timeRange}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 border-t border-white/10 pt-4">
                    <dt className="text-[11px] font-medium tracking-[0.12em] text-[#8D93A1] uppercase">
                      Local e Endereço
                    </dt>
                    <dd className="mt-1.5 flex flex-col gap-1">
                      <span className="flex items-start gap-1.5 text-sm font-semibold text-white">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
                        <span>{EVENT_LOCATION.venueLabel}</span>
                      </span>
                      <span className="pl-5.5 text-xs leading-relaxed text-[#B4B9C4]">
                        {EVENT_LOCATION.address}
                      </span>
                      <a
                        href={EVENT_LOCATION.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex w-fit items-center gap-1 pl-5.5 text-xs font-semibold text-[#E11D38] transition-colors hover:text-white"
                      >
                        Abrir localização no Google Maps
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </dd>
                  </div>
                </dl>
              )}

              {/* Primary + Secondary CTAs */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => onNavigate('ingressos')}
                  className="hz-crimson-button inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-md px-7 py-3 text-sm font-bold tracking-[0.08em] text-white uppercase whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Ticket className="h-4 w-4" aria-hidden="true" />
                  Comprar Ingresso
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('pre-lista')}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-white/20 bg-[#0D0D11] px-7 py-3 text-sm font-bold tracking-[0.08em] text-white uppercase transition-colors hover:border-[#E11D38]/70 hover:bg-[#14141B] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D38]"
                >
                  Adicionar Nome na Lista
                  <ArrowRight className="h-4 w-4 text-[#E11D38]" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Hero Visual Stage Card */}
            <div className="hz-fade-scale lg:col-span-5">
              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-white/12 bg-[#09090D] p-6 sm:p-8">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#DC143C]/20 blur-3xl"
                />

                <div className="relative flex items-center justify-between border-b border-white/10 pb-4 text-xs font-medium tracking-[0.12em] text-[#9CA3AF] uppercase">
                  <span>Identidade Oficial</span>
                  <span className="font-mono text-[#E11D38]">12.12</span>
                </div>

                <div className="relative my-8 flex items-center justify-center">
                  <div className="relative rounded-full p-2 shadow-[0_0_60px_rgba(220,20,60,0.22)]">
                    <img
                      src="/assets/aistudio/hz_party_icon_eebb473c.png"
                      alt="Emblema oficial HZ PARTY em prata metálico e vermelho intenso"
                      referrerPolicy="no-referrer"
                      className="h-56 w-56 rounded-full object-cover sm:h-64 sm:w-64"
                    />
                  </div>
                </div>

                <div className="relative space-y-2 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9CA3AF]">Abertura da festa</span>
                    <span className="font-mono font-semibold text-white tabular-nums">
                      22:30 · Pontualmente
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9CA3AF]">Encerramento</span>
                    <span className="font-mono font-semibold text-white tabular-nums">
                      05:00 · Sem pausa
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#9CA3AF]">Chácara</span>
                    <span className="text-right font-semibold text-white">
                      {EVENT_LOCATION.venueName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9CA3AF]">Acesso digital</span>
                    <button
                      type="button"
                      onClick={() => onNavigate('meu-ingresso')}
                      className="font-semibold text-[#E11D38] transition-colors hover:text-white"
                    >
                      Consultar QR Code →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Atmospheric Pillars (Editorial Numbering) */}
      <section className="border-b border-white/10 bg-[#07070A] py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                Padrão HZ PARTY
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white uppercase sm:text-4xl">
                Estrutura desenhada para a madrugada
              </h2>
            </div>
            <p className="max-w-md text-sm text-[#9CA3AF]">
              Som de alta qualidade e DJs qualificados, com organização de lista e
              validação rápida na entrada.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-12">
            <div className="hz-card-surface rounded-lg p-6 md:col-span-5">
              <p className="font-mono text-xs font-semibold text-[#E11D38]">01</p>
              <h3 className="mt-3 font-display text-2xl font-bold text-white uppercase">
                DJ Qualificado, Carro de som
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">
                Som de alta qualidade e DJs qualificados comandando o carro de som do
                início até às 05:00 da manhã.
              </p>
            </div>

            <div className="hz-card-surface rounded-lg p-6 md:col-span-4">
              <p className="font-mono text-xs font-semibold text-[#E11D38]">02</p>
              <h3 className="mt-3 font-display text-2xl font-bold text-white uppercase">
                Lista e Lotes
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">
                Lista (sem nome pagará mais caro), lotes conforme o evento ocorre.
              </p>
            </div>

            <div className="hz-card-surface rounded-lg p-6 md:col-span-3">
              <p className="font-mono text-xs font-semibold text-[#E11D38]">03</p>
              <h3 className="mt-3 font-display text-2xl font-bold text-white uppercase">
                Check-in em QR
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9CA3AF]">
                Passe digital individual com código exclusivo e leitura rápida na
                entrada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Party WhatsApp Groups */}
      <section aria-labelledby="grupos-festa-heading" className="bg-[#050507] py-14 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                Comunidade Oficial
              </p>
              <h2
                id="grupos-festa-heading"
                className="mt-2 font-display text-3xl font-bold tracking-tight text-white uppercase sm:text-4xl"
              >
                Grupos da Festa no WhatsApp
              </h2>
            </div>
            <p className="max-w-md text-sm text-[#9CA3AF]">
              Acompanhe avisos da chácara ({EVENT_LOCATION.venueName}), atualização de
              lista e informações da edição de 12 de Dezembro.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {PARTY_WHATSAPP_GROUPS.map((group) => (
              <a
                key={group.id}
                href={group.href}
                target="_blank"
                rel="noreferrer"
                className="hz-card-surface hz-card-surface-hover flex min-h-[84px] items-center justify-between gap-4 rounded-xl p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#DC143C]/40 bg-[#DC143C]/12 text-[#E11D38]">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold text-white uppercase">
                      {group.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-[#9CA3AF]">{group.subtitle}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#E11D38] uppercase whitespace-nowrap shrink-0">
                  Entrar
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
