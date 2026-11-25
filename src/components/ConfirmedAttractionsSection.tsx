import { useState } from 'react';
import { Calendar, CheckCircle2, Clock, Disc3, Ticket } from 'lucide-react';
import type { ConfirmedAttraction, PageRoute } from '../types/hz';

interface ConfirmedAttractionsSectionProps {
  attractions: ConfirmedAttraction[];
  onNavigate: (page: PageRoute) => void;
}

function AttractionPoster({
  imageUrl,
  imageAlt,
  name,
}: {
  imageUrl: string;
  imageAlt: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#DC143C]/45 bg-[#050507] shadow-[0_0_40px_rgba(220,20,60,0.22)]">
      {/* Urban corner registration brackets */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 left-2 z-20 h-4 w-4 border-t-2 border-l-2 border-[#E11D38]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 right-2 z-20 h-4 w-4 border-t-2 border-r-2 border-[#E11D38]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 left-2 z-20 h-4 w-4 border-b-2 border-l-2 border-[#E11D38]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 bottom-2 z-20 h-4 w-4 border-r-2 border-b-2 border-[#E11D38]"
      />

      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#09090D]">
        {!failed ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover object-top transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_center,rgba(220,20,60,0.22),#07070A_70%)] p-6 text-center">
            <Disc3 className="h-12 w-12 text-[#E11D38]" aria-hidden="true" />
            <p className="mt-4 font-display text-2xl font-extrabold tracking-wide text-white uppercase">
              {name}
            </p>
            <p className="mt-1 text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
              HZ PARTY
            </p>
          </div>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#050507]/85 via-[#050507]/25 to-transparent"
        />
      </div>
    </div>
  );
}

export function ConfirmedAttractionsSection({
  attractions,
  onNavigate,
}: ConfirmedAttractionsSectionProps) {
  if (attractions.length === 0) return null;

  const isSingleFeatured = attractions.length === 1;

  return (
    <section
      id="atracoes-confirmadas"
      aria-labelledby="atracoes-confirmadas-heading"
      data-testid="confirmed-attractions-section"
      className="relative scroll-mt-20 overflow-hidden border-b border-white/10 bg-[#050507] py-14 sm:py-20"
    >
      {/* Subtle crimson urban ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(220,20,60,0.18)_0%,rgba(120,10,28,0.06)_50%,transparent_80%)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[#E11D38] uppercase">
              Atrações Confirmadas
            </p>
            <h2
              id="atracoes-confirmadas-heading"
              className="mt-2 font-display text-[clamp(2.15rem,4vw,3.4rem)] leading-[0.98] font-extrabold tracking-tight text-white uppercase"
              style={{ textWrap: 'balance' }}
            >
              🔥 ATRAÇÃO CONFIRMADA
            </h2>
          </div>

          <p className="max-w-md text-sm leading-relaxed text-[#B4B9C4]">
            Line-up oficial da edição de <strong className="text-white">12/12</strong>.
            Confira os horários de cada apresentação na pista da HZ PARTY.
          </p>
        </div>

        {/* Single-DJ Spotlight Mode */}
        {isSingleFeatured ? (
          (() => {
            const dj = attractions[0];
            return (
              <article
                data-testid={`attraction-card-${dj.id}`}
                className="group relative mt-8 overflow-hidden rounded-xl border border-[#DC143C]/45 bg-[#0A090E] p-5 shadow-[0_0_60px_rgba(220,20,60,0.14)] sm:p-8"
              >
                {/* Crimson top edge highlight */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#E11D38] to-transparent"
                />

                <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
                  {/* DJ Poster Frame */}
                  <div className="mx-auto w-full max-w-[380px] lg:col-span-5 lg:max-w-none">
                    <AttractionPoster
                      imageUrl={dj.imageUrl}
                      imageAlt={dj.imageAlt}
                      name={dj.name}
                    />
                  </div>

                  {/* DJ Spotlight Details */}
                  <div className="flex flex-col justify-between lg:col-span-7">
                    <div>
                      {/* Status & Seal Header Row */}
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#E11D38] bg-[#E11D38]/15 px-3 py-1 text-xs font-extrabold tracking-[0.16em] text-white uppercase shadow-[0_0_20px_rgba(225,29,56,0.3)]">
                          <CheckCircle2
                            className="h-3.5 w-3.5 shrink-0 text-[#E11D38]"
                            aria-hidden="true"
                          />
                          {dj.badgeLabel}
                        </span>
                        <span className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                          {dj.statusLabel}
                        </span>
                      </div>

                      {/* DJ Name */}
                      <h3
                        className="mt-4 font-display text-[clamp(2.6rem,5vw,4.25rem)] leading-[0.94] font-extrabold tracking-tight text-white uppercase drop-shadow-[0_0_24px_rgba(225,29,56,0.28)]"
                        style={{ textWrap: 'balance' }}
                      >
                        {dj.name}
                      </h3>

                      <p className="mt-2 text-xs font-semibold tracking-[0.14em] text-[#9CA3AF] uppercase">
                        {dj.role}
                      </p>

                      {dj.description && (
                        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#C7CBD4] sm:text-base">
                          {dj.description}
                        </p>
                      )}
                    </div>

                    {/* High-Visibility Schedule & Date Showcase */}
                    <div className="mt-7 grid grid-cols-1 gap-4 border-y border-white/10 py-6 sm:grid-cols-12">
                      <div className="rounded-lg border border-[#E11D38]/55 bg-[linear-gradient(135deg,rgba(225,29,56,0.16)_0%,rgba(12,10,16,0.95)_75%)] p-4 shadow-[0_0_28px_rgba(225,29,56,0.16)] sm:col-span-7">
                        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-[#FDA4AF] uppercase">
                          <Clock className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          Horário de Apresentação
                        </p>
                        <p
                          data-testid="attraction-schedule"
                          className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-white tabular-nums sm:text-3xl"
                        >
                          {dj.schedule}
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/12 bg-[#07070B] p-4 sm:col-span-5">
                        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-[#9CA3AF] uppercase">
                          <Calendar className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
                          Data do Evento
                        </p>
                        <p
                          data-testid="attraction-date"
                          className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-white tabular-nums sm:text-3xl"
                        >
                          {dj.eventDate}
                        </p>
                      </div>
                    </div>

                    {/* Direct Ticket CTA */}
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-relaxed text-[#9CA3AF]">
                        Garanta seu ingresso antecipado com QR Code individual para curtir o set completo.
                      </p>
                      <button
                        type="button"
                        onClick={() => onNavigate('ingressos')}
                        className="hz-crimson-button inline-flex min-h-[46px] items-center justify-center gap-2 rounded-md px-6 py-2.5 text-xs font-bold tracking-[0.1em] text-white uppercase whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <Ticket className="h-4 w-4" aria-hidden="true" />
                        Garantir Ingresso
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })()
        ) : (
          /* Multi-DJ Scalable Responsive Grid (automatically activates as more DJs are added) */
          <div
            className={`mt-8 grid grid-cols-1 gap-6 ${
              attractions.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {attractions.map((dj) => (
              <article
                key={dj.id}
                data-testid={`attraction-card-${dj.id}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-[#DC143C]/35 bg-[#0A090E] p-5 transition-colors hover:border-[#E11D38]/70 hover:shadow-[0_0_40px_rgba(220,20,60,0.18)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#E11D38] to-transparent"
                />

                <AttractionPoster
                  imageUrl={dj.imageUrl}
                  imageAlt={dj.imageAlt}
                  name={dj.name}
                />

                <div className="mt-5 flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1 rounded-sm border border-[#E11D38] bg-[#E11D38]/15 px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.15em] text-white uppercase shadow-[0_0_14px_rgba(225,29,56,0.28)]">
                        <CheckCircle2
                          className="h-3 w-3 shrink-0 text-[#E11D38]"
                          aria-hidden="true"
                        />
                        {dj.badgeLabel}
                      </span>
                      <span className="text-[11px] font-bold tracking-[0.14em] text-[#E11D38] uppercase">
                        {dj.statusLabel}
                      </span>
                    </div>
                    <h3 className="mt-2.5 font-display text-3xl leading-none font-extrabold tracking-tight text-white uppercase">
                      {dj.name}
                    </h3>
                    <p className="mt-1.5 text-xs text-[#9CA3AF]">{dj.role}</p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                    <div className="rounded-md border border-[#E11D38]/45 bg-[#E11D38]/10 px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] text-[#FDA4AF] uppercase">
                        <Clock className="h-3 w-3 text-[#E11D38]" aria-hidden="true" />
                        Horário
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
                        {dj.schedule}
                      </p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-[#07070B] px-3 py-2.5">
                      <p className="flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] text-[#9CA3AF] uppercase">
                        <Calendar className="h-3 w-3 text-[#E11D38]" aria-hidden="true" />
                        Data
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold text-white tabular-nums">
                        {dj.eventDate}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
