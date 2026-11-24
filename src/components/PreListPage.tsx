import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Search,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { EVENT_LOCATION, PARTY_WHATSAPP_GROUPS } from '../data/events';
import { submitGuestListEntry } from '../services/hzStore';
import type {
  EventEdition,
  PageRoute,
  PreListEntry,
  PublicGuestListEntry,
} from '../types/hz';
import { filterGuestListByQuery } from '../utils/guestList';
import { formatWhatsAppInput, isValidWhatsApp } from '../utils/ticketing';

interface PreListPageProps {
  events: EventEdition[];
  publicEntries: PublicGuestListEntry[];
  onAddEntry: (entry: PreListEntry) => void;
  onNavigate: (page: PageRoute) => void;
}

export function PreListPage({
  events,
  publicEntries,
  onAddEntry,
  onNavigate,
}: PreListPageProps) {
  const activeEvent = events.find((e) => e.status === 'proximo') ?? events[0];
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedEventTitle, setSelectedEventTitle] = useState(
    activeEvent?.title ?? 'HZ PARTY — Edição Principal'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedEntry, setConfirmedEntry] = useState<PreListEntry | null>(null);
  const [showPublicList, setShowPublicList] = useState(false);
  const [nameSearchQuery, setNameSearchQuery] = useState('');

  const filteredPublicEntries = useMemo(
    () => filterGuestListByQuery(publicEntries, nameSearchQuery),
    [publicEntries, nameSearchQuery]
  );

  const hasActiveSearch = nameSearchQuery.trim().length > 0;
  const shouldRenderRows = showPublicList || hasActiveSearch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (trimmedName.length < 3) {
      setErrorMsg('Informe seu nome completo (mínimo de 3 caracteres).');
      return;
    }
    if (!isValidWhatsApp(whatsapp)) {
      setErrorMsg('Informe um WhatsApp válido com DDD (10 ou 11 dígitos).');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const entry = await submitGuestListEntry({
        fullName: trimmedName,
        whatsapp,
        eventTitle: selectedEventTitle,
      });
      onAddEntry(entry);
      setConfirmedEntry(entry);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        'Não foi possível salvar seu nome na lista agora. Tente novamente em instantes.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setConfirmedEntry(null);
    setFullName('');
    setWhatsapp('');
    setErrorMsg(null);
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Left: List Information & WhatsApp Party Groups */}
        <div className="lg:col-span-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
            Confirmação de Presença
          </p>
          <h1
            className="mt-2 font-display text-4xl font-extrabold tracking-tight text-white uppercase sm:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            Adicionar Nome na Lista
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] sm:text-base">
            Cadastre seu nome completo e WhatsApp para a edição de{' '}
            <strong className="font-semibold text-white">
              12 de Dezembro (22:30 às 05:00)
            </strong>{' '}
            na <strong className="font-semibold text-white">{EVENT_LOCATION.venueLabel}</strong>{' '}
            — {EVENT_LOCATION.address}. Lista (sem nome pagará mais caro), lotes conforme o evento ocorre.
          </p>

          <div className="mt-8 space-y-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">
              Grupos Oficiais da Festa
            </h2>
            {PARTY_WHATSAPP_GROUPS.map((group) => (
              <a
                key={group.id}
                href={group.href}
                target="_blank"
                rel="noreferrer"
                className="hz-card-surface hz-card-surface-hover flex min-h-[68px] items-center justify-between gap-3 rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <MessageCircle
                    className="h-5 w-5 shrink-0 text-[#E11D38]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-display text-lg font-bold text-white uppercase">
                      {group.title}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">{group.subtitle}</p>
                  </div>
                </div>
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-[#9CA3AF]"
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>

          <div className="mt-6 flex items-start gap-3 text-xs text-[#8D93A1]">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#E11D38]" aria-hidden="true" />
            <p>
              Seu nome e protocolo ficam salvos no banco de dados oficial da festa para
              conferência na portaria.
            </p>
          </div>
        </div>

        {/* Right: Registration Form or Confirmation Card */}
        <div className="lg:col-span-7">
          {confirmedEntry ? (
            <div
              data-testid="prelist-confirmation"
              className="rounded-xl border border-[#DC143C]/50 bg-[#0B0B10] p-6 sm:p-8"
            >
              <div className="flex items-center gap-3 text-[#E11D38]">
                <CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden="true" />
                <span className="text-xs font-bold tracking-[0.14em] uppercase">
                  Nome Adicionado na Lista
                </span>
              </div>

              <h2 className="mt-3 font-display text-3xl font-bold text-white uppercase">
                Presença registrada na lista
              </h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                Guarde seu protocolo abaixo e entre em um dos grupos oficiais da festa
                no WhatsApp.
              </p>

              <dl className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-[#050507] p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    Protocolo
                  </dt>
                  <dd className="mt-1 font-mono text-lg font-bold text-[#E11D38]">
                    {confirmedEntry.protocol}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    Situação
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-white">
                    Salvo na Lista Oficial
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    Nome Completo
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-white">
                    {confirmedEntry.fullName}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    WhatsApp
                  </dt>
                  <dd className="mt-1 font-mono text-sm text-[#E2E4E9]">
                    {confirmedEntry.whatsapp}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] tracking-[0.12em] text-[#8D93A1] uppercase">
                    Evento
                  </dt>
                  <dd className="mt-1 text-sm text-[#D1D5DB]">
                    {confirmedEntry.eventTitle} · 12 de Dezembro (22:30 às 05:00)
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-white/15 bg-[#121218] px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:border-white/35"
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Adicionar Outro Nome
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('ingressos')}
                  className="hz-crimson-button inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase"
                >
                  Comprar Ingresso
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="rounded-xl border border-white/10 bg-[#0B0B10] p-6 sm:p-8"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="font-display text-2xl font-bold text-white uppercase">
                  Adicionar Nome na Lista
                </h2>
                <ClipboardCheck className="h-5 w-5 text-[#E11D38]" aria-hidden="true" />
              </div>

              <div className="mt-6 space-y-5">
                {events.length > 1 && (
                  <div>
                    <label
                      htmlFor="prelist-event"
                      className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
                    >
                      Evento
                    </label>
                    <select
                      id="prelist-event"
                      value={selectedEventTitle}
                      onChange={(e) => setSelectedEventTitle(e.target.value)}
                      className="mt-2 block min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2.5 text-sm text-white focus:border-[#E11D38] focus:outline-none"
                    >
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.title}>
                          {ev.title} — {ev.dateLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="prelist-name"
                    className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
                  >
                    Nome Completo
                  </label>
                  <input
                    id="prelist-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex.: Lucas Ferreira Mendes"
                    className="mt-2 block min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2.5 text-sm text-white placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prelist-whatsapp"
                    className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
                  >
                    WhatsApp (com DDD)
                  </label>
                  <input
                    id="prelist-whatsapp"
                    type="tel"
                    inputMode="numeric"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(formatWhatsAppInput(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="mt-2 block min-h-[44px] w-full rounded-md border border-white/15 bg-[#050507] px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
                  />
                </div>

                {errorMsg && (
                  <p
                    role="alert"
                    className="rounded-md border border-[#E11D38]/50 bg-[#E11D38]/10 px-4 py-2.5 text-sm font-medium text-[#FDA4AF]"
                  >
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="hz-crimson-button flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-bold tracking-[0.08em] text-white uppercase disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {isSubmitting ? 'Salvando na Lista...' : 'Adicionar Nome na Lista'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Public Guest List & Name Lookup (Alphabetical A-Z) */}
      <div className="mt-14 border-t border-white/10 pt-10">
        <div className="rounded-2xl border border-white/10 bg-[#0B0B10] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[#E11D38] uppercase">
                Consulta Pública · Ordem Alfabética (A–Z)
              </p>
              <h2 className="mt-1.5 font-display text-3xl font-bold text-white uppercase">
                Nomes na Lista ({publicEntries.length})
              </h2>
              <p className="mt-1 text-xs text-[#9CA3AF] sm:text-sm">
                Consulte seu nome ou protocolo em ordem alfabética. Números de WhatsApp
                permanecem privados.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPublicList((prev) => !prev)}
              aria-expanded={showPublicList}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-md border border-[#E11D38]/55 bg-[#E11D38]/12 px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-[#E11D38] md:self-auto whitespace-nowrap shrink-0"
            >
              {showPublicList ? (
                <>
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                  Ocultar Lista
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Mostrar Lista
                </>
              )}
            </button>
          </div>

          {/* Search Name Input */}
          <div className="mt-6">
            <label
              htmlFor="guestlist-name-search"
              className="block text-xs font-semibold tracking-[0.1em] text-[#D1D5DB] uppercase"
            >
              Consultar Nome na Lista
            </label>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                aria-hidden="true"
              />
              <input
                id="guestlist-name-search"
                type="search"
                value={nameSearchQuery}
                onChange={(e) => setNameSearchQuery(e.target.value)}
                placeholder="Digite seu nome ou código HZPL-XXXXXX..."
                className="block min-h-[46px] w-full rounded-md border border-white/15 bg-[#050507] py-2.5 pr-4 pl-10 text-sm text-white placeholder:text-[#6B7280] focus:border-[#E11D38] focus:outline-none"
              />
            </div>
          </div>

          {!shouldRenderRows ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-[#050507] px-6 py-8 text-center">
              <Users className="h-7 w-7 text-[#E11D38]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-white">
                Lista oculta no momento
              </p>
              <p className="mt-1 max-w-md text-xs text-[#9CA3AF]">
                Digite um nome no campo de busca acima ou clique em{' '}
                <strong className="text-white">Mostrar Lista</strong> para visualizar
                todos os nomes cadastrados em ordem alfabética.
              </p>
            </div>
          ) : filteredPublicEntries.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#050507] p-8 text-center">
              <p className="text-sm font-semibold text-white">
                {hasActiveSearch
                  ? `Nenhum nome encontrado para "${nameSearchQuery.trim()}".`
                  : 'Nenhum nome cadastrado na lista ainda.'}
              </p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                {hasActiveSearch
                  ? 'Confira a grafia ou preencha o formulário acima para incluir seu nome.'
                  : 'Seja o primeiro a adicionar seu nome no formulário acima.'}
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-[#050507]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-[#9CA3AF]">
                <span>
                  Exibindo <strong className="text-white tabular-nums">{filteredPublicEntries.length}</strong>{' '}
                  {filteredPublicEntries.length === 1 ? 'nome' : 'nomes'} em ordem alfabética
                </span>
                <span className="font-mono text-[11px] uppercase">A–Z</span>
              </div>
              <ul
                data-testid="public-guest-list"
                className="max-h-[420px] divide-y divide-white/10 overflow-y-auto"
              >
                {filteredPublicEntries.map((entry, index) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 font-mono text-xs text-[#71717A] tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {entry.fullName}
                        </p>
                        <p className="font-mono text-xs text-[#9CA3AF]">
                          {entry.protocol}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold uppercase ${
                        entry.status === 'confirmado'
                          ? 'text-emerald-400'
                          : 'text-[#E11D38]'
                      }`}
                    >
                      {entry.status === 'confirmado' ? 'Confirmado' : 'Na Lista'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
