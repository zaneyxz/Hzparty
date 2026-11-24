import { useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { getEventCountdown, padTwoDigits } from '../utils/countdown';
import type { PageRoute } from '../types/hz';

interface CountdownBannerProps {
  onNavigate: (page: PageRoute) => void;
}

export function CountdownBanner({ onNavigate }: CountdownBannerProps) {
  const [countdown, setCountdown] = useState(() => getEventCountdown(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(getEventCountdown(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const units = [
    { label: 'Dias', value: padTwoDigits(countdown.days) },
    { label: 'Horas', value: padTwoDigits(countdown.hours) },
    { label: 'Min', value: padTwoDigits(countdown.minutes) },
    { label: 'Seg', value: padTwoDigits(countdown.seconds) },
  ];

  return (
    <section
      aria-label="Contagem regressiva para a próxima edição"
      className="relative overflow-hidden border-b border-white/10 bg-[#09090D]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_120%_at_50%_0%,rgba(220,20,60,0.18),transparent_70%)]"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-3.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="font-display text-sm font-bold tracking-[0.14em] text-[#E11D38] uppercase">
            {countdown.status === 'live'
              ? 'Edição em andamento agora'
              : 'Próxima Edição Confirmada'}
          </span>
          <span aria-hidden="true" className="hidden text-white/20 sm:inline">
            ·
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#E2E4E9]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Calendar className="h-3.5 w-3.5 text-[#E11D38]" aria-hidden="true" />
              {countdown.eventDateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#A1A7B3]">
              <Clock className="h-3.5 w-3.5 text-[#A1A7B3]" aria-hidden="true" />
              {countdown.eventTimeLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-start lg:justify-end">
          <div
            data-testid="countdown-timer"
            className="grid grid-cols-4 gap-2 sm:gap-2.5"
          >
            {units.map((unit) => (
              <div
                key={unit.label}
                className="flex min-w-[58px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#050507]/90 px-2.5 py-1.5 sm:min-w-[66px]"
              >
                <span className="font-mono text-lg leading-none font-bold tracking-tight text-white tabular-nums sm:text-xl">
                  {unit.value}
                </span>
                <span className="mt-1 text-[10px] font-medium tracking-[0.12em] text-[#9CA3AF] uppercase">
                  {unit.label}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('ingressos')}
            className="hidden min-h-[40px] items-center justify-center rounded-md border border-[#E11D38]/50 bg-[#E11D38]/12 px-4 py-2 text-xs font-semibold tracking-wider text-white uppercase transition-colors hover:bg-[#E11D38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D38] sm:inline-flex whitespace-nowrap shrink-0"
          >
            Comprar Ingresso
          </button>
        </div>
      </div>
    </section>
  );
}
