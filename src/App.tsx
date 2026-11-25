import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { INITIAL_EVENTS, INITIAL_TICKET_BATCHES } from './data/events';
import { auth } from './lib/firebase';
import {
  adminCreatePromoter,
  adminDeletePromoter,
  adminRemoveGuest,
  adminSaveEvent,
  adminScanAndValidateTicket,
  adminSyncPendingMercadoPagoPayments,
  adminToggleGuestStatus,
  adminTogglePromoterActive,
  adminUpdateEventStatus,
  adminUpdatePromoter,
  adminUpdateTicketStatus,
  checkAuthorizedAdminAccess,
  fetchTicketPassByCode,
  isVerifiedAdminEmail,
  signInAdminWithGoogle,
  signOutAdmin,
  subscribeAdminData,
  subscribePublicEvents,
  subscribePublicGuestList,
  subscribePublicPromoters,
} from './services/hzStore';
import { checkMercadoPagoPaymentStatus } from './services/paymentsApi';
import type {
  EventEdition,
  PageRoute,
  PreListEntry,
  Promoter,
  PublicGuestListEntry,
  TicketReservation,
  TicketStatus,
} from './types/hz';
import { sortGuestListAlphabetically } from './utils/guestList';
import { Header } from './components/Header';
import { CountdownBanner } from './components/CountdownBanner';
import { HomePage } from './components/HomePage';
import { PreListPage } from './components/PreListPage';
import { TicketsPage } from './components/TicketsPage';
import { MyTicketPage } from './components/MyTicketPage';
import { AdminPage, type AdminAuthUser } from './components/AdminPage';
import { Footer } from './components/Footer';

const MY_TICKET_CODES_STORAGE_KEY = 'hz_party_my_ticket_codes_v1';

function readStoredTicketCodes(): string[] {
  try {
    const raw = window.localStorage.getItem(MY_TICKET_CODES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && /^HZ-[A-Z0-9]{6}$/.test(item))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function writeStoredTicketCode(ticketCode: string) {
  try {
    const normalized = ticketCode.trim().toUpperCase();
    if (!/^HZ-[A-Z0-9]{6}$/.test(normalized)) return;
    const existing = readStoredTicketCodes().filter((c) => c !== normalized);
    const next = [normalized, ...existing].slice(0, 20);
    window.localStorage.setItem(MY_TICKET_CODES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageRoute>('home');
  const [events, setEvents] = useState<EventEdition[]>(INITIAL_EVENTS);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [publicGuestList, setPublicGuestList] = useState<PublicGuestListEntry[]>([]);
  const [sessionPreList, setSessionPreList] = useState<PreListEntry[]>([]);
  const [sessionReservations, setSessionReservations] = useState<TicketReservation[]>([]);

  // Auth & Admin Firestore subscriptions
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AdminAuthUser | null>(null);
  const [isStaffAdmin, setIsStaffAdmin] = useState(false);
  const [staffCheckReady, setStaffCheckReady] = useState(true);
  const [adminGuestList, setAdminGuestList] = useState<PreListEntry[]>([]);
  const [adminTickets, setAdminTickets] = useState<TicketReservation[]>([]);
  const [adminLoadError, setAdminLoadError] = useState<string | null>(null);

  const isBootstrappedAdmin = isVerifiedAdminEmail(
    authUser?.email,
    authUser?.emailVerified
  );
  const isAuthorizedAdmin = isBootstrappedAdmin || isStaffAdmin;

  useEffect(() => {
    let active = true;
    if (!authUser || isBootstrappedAdmin) {
      setIsStaffAdmin(false);
      setStaffCheckReady(true);
      return;
    }
    setStaffCheckReady(false);
    void checkAuthorizedAdminAccess(authUser).then((allowed) => {
      if (!active) return;
      setIsStaffAdmin(allowed);
      setStaffCheckReady(true);
    });
    return () => {
      active = false;
    };
  }, [authUser, isBootstrappedAdmin]);

  // Hydrate visitor's saved ticket codes on reopen (Firestore + live Mercado Pago status)
  useEffect(() => {
    let active = true;
    const savedCodes = readStoredTicketCodes();
    if (savedCodes.length === 0) return;

    const hydrateTickets = async () => {
      const hydrated: TicketReservation[] = [];
      for (const code of savedCodes) {
        try {
          const pass = await fetchTicketPassByCode(code);
          if (!pass) continue;
          if (pass.mpPaymentId && pass.status === 'aguardando-pagamento') {
            try {
              const mp = await checkMercadoPagoPaymentStatus(pass.mpPaymentId);
              if (mp.normalizedStatus === 'pago') {
                pass.status = 'pago';
              }
            } catch {
              // Keep Firestore status if MP check is temporarily unavailable
            }
          }
          hydrated.push(pass);
        } catch {
          // Skip failed individual ticket lookup
        }
      }
      if (!active || hydrated.length === 0) return;
      setSessionReservations((prev) => {
        const map = new Map<string, TicketReservation>();
        for (const item of hydrated) map.set(item.ticketCode, item);
        for (const item of prev) map.set(item.ticketCode, item);
        return Array.from(map.values());
      });
    };

    void hydrateTickets();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
        });
      } else {
        setAuthUser(null);
      }
      setAuthReady(true);
    });

    const unsubEvents = subscribePublicEvents(setEvents);
    const unsubPublicGuestList = subscribePublicGuestList(setPublicGuestList);
    const unsubPromoters = subscribePublicPromoters(setPromoters);

    return () => {
      unsubAuth();
      unsubEvents();
      unsubPublicGuestList();
      unsubPromoters();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !isAuthorizedAdmin) {
      setAdminGuestList([]);
      setAdminTickets([]);
      setAdminLoadError(null);
      return;
    }

    const unsubAdmin = subscribeAdminData({
      onGuestList: (entries) => {
        setAdminGuestList(entries);
        setAdminLoadError(null);
      },
      onTickets: (tickets) => {
        setAdminTickets(tickets);
        setAdminLoadError(null);
      },
      onError: () => {
        setAdminLoadError(
          'Erro ao carregar dados do Firestore. Verifique suas permissões de administrador.'
        );
      },
    });

    return () => {
      unsubAdmin();
    };
  }, [authReady, isAuthorizedAdmin]);

  const activeEvent = events.find((e) => e.status === 'proximo') ?? events[0];

  const mergedReservations = useMemo(() => {
    if (!isAuthorizedAdmin) return sessionReservations;
    const byCode = new Map<string, TicketReservation>();
    for (const ticket of adminTickets) {
      byCode.set(ticket.ticketCode, ticket);
    }
    for (const local of sessionReservations) {
      if (!byCode.has(local.ticketCode)) {
        byCode.set(local.ticketCode, local);
      }
    }
    return Array.from(byCode.values());
  }, [isAuthorizedAdmin, adminTickets, sessionReservations]);

  const effectivePreList = isAuthorizedAdmin ? adminGuestList : sessionPreList;

  const handleNavigate = (page: PageRoute) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddPreListEntry = (entry: PreListEntry) => {
    setSessionPreList((prev) => [entry, ...prev]);
    setPublicGuestList((prev) => {
      if (prev.some((item) => item.id === entry.id || item.protocol === entry.protocol)) {
        return prev;
      }
      return sortGuestListAlphabetically([
        ...prev,
        {
          id: entry.id,
          protocol: entry.protocol,
          fullName: entry.fullName,
          eventTitle: entry.eventTitle,
          createdAt: entry.createdAt,
          status: entry.status,
        },
      ]);
    });
  };

  const handleRememberTicket = useCallback((ticket: TicketReservation) => {
    writeStoredTicketCode(ticket.ticketCode);
    setSessionReservations((prev) => {
      const filtered = prev.filter((r) => r.ticketCode !== ticket.ticketCode);
      return [ticket, ...filtered];
    });
  }, []);

  const handleCreateReservation = (reservation: TicketReservation) => {
    writeStoredTicketCode(reservation.ticketCode);
    setSessionReservations((prev) => [reservation, ...prev]);
  };

  const handleUpdateReservationStatus = (
    ticketCode: string,
    status: TicketStatus
  ) => {
    setSessionReservations((prev) =>
      prev.map((r) =>
        r.ticketCode === ticketCode ? { ...r, status } : r
      )
    );
    if (isAuthorizedAdmin) {
      void adminUpdateTicketStatus(ticketCode, status);
    }
  };

  const handleAddEvent = async (newEvent: EventEdition) => {
    await adminSaveEvent(newEvent);
  };

  const handleUpdateEventStatus = async (
    id: string,
    status: EventEdition['status']
  ) => {
    await adminUpdateEventStatus(id, status);
  };

  const handleTogglePreListStatus = async (
    id: string,
    currentStatus: 'aguardando' | 'confirmado'
  ) => {
    await adminToggleGuestStatus(id, currentStatus);
  };

  const handleRemovePreListEntry = async (id: string) => {
    await adminRemoveGuest(id);
  };

  const handleAdminUpdateTicketStatus = async (
    ticketCode: string,
    status: TicketStatus,
    validatedAtLabel?: string
  ) => {
    await adminUpdateTicketStatus(ticketCode, status, validatedAtLabel);
    setSessionReservations((prev) =>
      prev.map((r) =>
        r.ticketCode === ticketCode
          ? {
              ...r,
              status,
              validatedAt: validatedAtLabel ?? r.validatedAt,
            }
          : r
      )
    );
  };

  const handleScanAndValidateTicket = useCallback(async (rawQrPayload: string) => {
    const outcome = await adminScanAndValidateTicket(rawQrPayload);
    if (outcome.outcome === 'valid' && outcome.ticket) {
      const validatedTicket = outcome.ticket;
      setSessionReservations((prev) =>
        prev.map((r) =>
          r.ticketCode === validatedTicket.ticketCode
            ? {
                ...r,
                status: 'validado',
                validatedAt: outcome.validatedAt ?? r.validatedAt,
              }
            : r
        )
      );
    }
    return outcome;
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#050507] text-[#F4F4F6]">
      <Header currentPage={currentPage} onNavigate={handleNavigate} />
      <CountdownBanner onNavigate={handleNavigate} />

      <main className="flex-1">
        {currentPage === 'home' && (
          <HomePage events={events} onNavigate={handleNavigate} />
        )}

        {currentPage === 'pre-lista' && (
          <PreListPage
            events={events}
            publicEntries={publicGuestList}
            onAddEntry={handleAddPreListEntry}
            onNavigate={handleNavigate}
          />
        )}

        {currentPage === 'ingressos' && (
          <TicketsPage
            event={activeEvent}
            batches={INITIAL_TICKET_BATCHES}
            promoters={promoters}
            onCreateReservation={handleCreateReservation}
            onUpdateReservationStatus={handleUpdateReservationStatus}
            onNavigate={handleNavigate}
          />
        )}

        {currentPage === 'meu-ingresso' && (
          <MyTicketPage
            event={activeEvent}
            reservations={mergedReservations}
            onRememberTicket={handleRememberTicket}
            onUpdateReservationStatus={handleUpdateReservationStatus}
            onNavigate={handleNavigate}
          />
        )}

        {currentPage === 'admin' && (
          <AdminPage
            authReady={authReady && staffCheckReady}
            authUser={authUser}
            isAuthorizedAdmin={isAuthorizedAdmin}
            adminLoadError={adminLoadError}
            events={events}
            preListEntries={effectivePreList}
            reservations={mergedReservations}
            promoters={promoters}
            onSignInGoogle={async () => {
              await signInAdminWithGoogle();
            }}
            onSignOut={signOutAdmin}
            onAddEvent={handleAddEvent}
            onUpdateEventStatus={handleUpdateEventStatus}
            onTogglePreListStatus={handleTogglePreListStatus}
            onRemovePreListEntry={handleRemovePreListEntry}
            onUpdateTicketStatus={handleAdminUpdateTicketStatus}
            onScanAndValidateTicket={handleScanAndValidateTicket}
            onCreatePromoter={adminCreatePromoter}
            onUpdatePromoter={adminUpdatePromoter}
            onTogglePromoterActive={adminTogglePromoterActive}
            onDeletePromoter={adminDeletePromoter}
            onSyncPendingPayments={() =>
              adminSyncPendingMercadoPagoPayments(mergedReservations)
            }
          />
        )}
      </main>

      <Footer onNavigate={handleNavigate} />
    </div>
  );
}
