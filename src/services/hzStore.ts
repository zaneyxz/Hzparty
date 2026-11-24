import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { INITIAL_EVENTS } from '../data/events';
import type {
  EventEdition,
  PreListEntry,
  PublicGuestListEntry,
  TicketReservation,
  TicketStatus,
} from '../types/hz';
import { sortGuestListAlphabetically } from '../utils/guestList';
import { generateVisualCode } from '../utils/ticketing';
import { splitFullName } from '../utils/mercadoPago';

function formatTimestamp(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isVerifiedAdminEmail(email: string | null | undefined, emailVerified: boolean | undefined): boolean {
  return Boolean(emailVerified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase());
}

export async function signInAdminWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutAdmin() {
  await signOut(auth);
}

export function subscribePublicEvents(
  onData: (events: EventEdition[]) => void
): Unsubscribe {
  const eventsRef = collection(db, 'events');
  return onSnapshot(
    eventsRef,
    (snapshot) => {
      if (snapshot.empty) {
        onData(INITIAL_EVENTS);
        return;
      }
      const list: EventEdition[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id ?? docSnap.id),
            title: String(d.title ?? ''),
            subtitle: String(d.subtitle ?? ''),
            dateLabel: String(d.dateLabel ?? ''),
            timeRange: String(d.timeRange ?? ''),
            venue: String(d.venue ?? ''),
            city: String(d.city ?? ''),
            status:
              d.status === 'proximo' || d.status === 'em-breve'
                ? d.status
                : 'rascunho',
            capacityLabel: String(d.capacityLabel ?? ''),
            ageRating: String(d.ageRating ?? ''),
            dressCode: String(d.dressCode ?? ''),
            lineupHighlights: Array.isArray(d.lineupHighlights)
              ? d.lineupHighlights.map(String)
              : [],
          };
        })
        .filter((ev) => ev.id !== 'hz-dec-05');

      if (list.length === 0) {
        onData(INITIAL_EVENTS);
        return;
      }
      onData(list);
    },
    (error) => {
      console.error('Public events subscription warning:', error.message);
      onData(INITIAL_EVENTS);
    }
  );
}

export function subscribePublicGuestList(
  onData: (entries: PublicGuestListEntry[]) => void
): Unsubscribe {
  const publicRef = collection(db, 'guest_list_public');
  return onSnapshot(
    publicRef,
    (snapshot) => {
      const list: PublicGuestListEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          protocol: String(d.protocol ?? ''),
          fullName: String(d.fullName ?? ''),
          eventTitle: String(d.eventTitle ?? ''),
          createdAt: formatTimestamp(d.createdAt),
          status: d.status === 'confirmado' ? 'confirmado' : 'aguardando',
        };
      });
      onData(sortGuestListAlphabetically(list));
    },
    (error) => {
      console.error('Public guest list subscription warning:', error.message);
    }
  );
}

export async function submitGuestListEntry(input: {
  fullName: string;
  whatsapp: string;
  eventTitle: string;
}): Promise<PreListEntry> {
  const fullName = input.fullName.trim().slice(0, 120);
  const whatsapp = input.whatsapp.trim().slice(0, 20);
  const eventTitle = input.eventTitle.trim().slice(0, 120);
  const protocol = generateVisualCode(
    'HZPL',
    `${fullName}-${whatsapp}-${Date.now()}-${Math.random()}`
  );
  const docId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `guest_list/${docId}`;

  const batch = writeBatch(db);
  const nowServer = serverTimestamp();

  batch.set(doc(db, 'guest_list', docId), {
    protocol,
    fullName,
    whatsapp,
    eventTitle,
    status: 'aguardando',
    createdAt: nowServer,
  });

  batch.set(doc(db, 'guest_list_public', docId), {
    protocol,
    fullName,
    eventTitle,
    status: 'aguardando',
    createdAt: nowServer,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    id: docId,
    protocol,
    fullName,
    whatsapp,
    modality: 'lista',
    eventTitle,
    createdAt: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: 'aguardando',
  };
}

export async function saveTicketOrder(input: {
  ticketCode: string;
  holderName: string;
  whatsapp: string;
  event: EventEdition;
  tierName: string;
  quantity: number;
  totalCents: number;
  mpPaymentId: string;
}): Promise<TicketReservation> {
  const { displayName } = splitFullName(input.holderName);
  const holderName = input.holderName.trim().slice(0, 120);
  const whatsapp = input.whatsapp.trim().slice(0, 20);
  const ticketCode = input.ticketCode.trim().toUpperCase();

  const batch = writeBatch(db);
  const ticketRef = doc(db, 'tickets', ticketCode);
  const contactRef = doc(db, 'ticket_contacts', ticketCode);

  batch.set(ticketRef, {
    ticketCode,
    displayName,
    eventTitle: input.event.title.slice(0, 120),
    eventDate: input.event.dateLabel.slice(0, 80),
    eventTime: input.event.timeRange.slice(0, 40),
    venue: input.event.venue.slice(0, 120),
    tierName: input.tierName.slice(0, 160),
    quantity: input.quantity,
    totalCents: input.totalCents,
    mpPaymentId: input.mpPaymentId.slice(0, 64),
    status: 'aguardando-pagamento',
    createdAt: serverTimestamp(),
  });

  batch.set(contactRef, {
    ticketCode,
    holderName,
    whatsapp,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tickets/${ticketCode}`);
  }

  return {
    id: ticketCode,
    ticketCode,
    holderName,
    displayName,
    whatsapp,
    eventTitle: input.event.title,
    eventDate: input.event.dateLabel,
    eventTime: input.event.timeRange,
    venue: input.event.venue,
    tierName: input.tierName,
    quantity: input.quantity,
    totalCents: input.totalCents,
    mpPaymentId: input.mpPaymentId,
    createdAt: new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: 'aguardando-pagamento',
  };
}

export async function fetchTicketPassByCode(
  rawCode: string
): Promise<TicketReservation | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^HZ-[A-Z0-9]{6}$/.test(code)) {
    return null;
  }

  const path = `tickets/${code}`;
  try {
    const snap = await getDoc(doc(db, 'tickets', code));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      ticketCode: String(d.ticketCode ?? snap.id),
      holderName: String(d.displayName ?? 'Titular'),
      displayName: String(d.displayName ?? ''),
      whatsapp: '',
      eventTitle: String(d.eventTitle ?? ''),
      eventDate: String(d.eventDate ?? ''),
      eventTime: String(d.eventTime ?? ''),
      venue: String(d.venue ?? ''),
      tierName: String(d.tierName ?? ''),
      quantity: Number(d.quantity ?? 1),
      totalCents: Number(d.totalCents ?? 0),
      mpPaymentId: String(d.mpPaymentId ?? ''),
      createdAt: formatTimestamp(d.createdAt),
      status:
        d.status === 'pago' || d.status === 'validado'
          ? d.status
          : 'aguardando-pagamento',
      validatedAt: d.validatedAtLabel ? String(d.validatedAtLabel) : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeAdminData(callbacks: {
  onGuestList: (entries: PreListEntry[]) => void;
  onTickets: (tickets: TicketReservation[]) => void;
  onError: (err: Error) => void;
}): () => void {
  let latestTicketsRaw: Array<Record<string, unknown> & { id: string }> = [];
  let latestContactsMap = new Map<string, { holderName: string; whatsapp: string }>();

  const emitMergedTickets = () => {
    const merged: TicketReservation[] = latestTicketsRaw.map((d) => {
      const contact = latestContactsMap.get(d.id);
      return {
        id: d.id,
        ticketCode: String(d.ticketCode ?? d.id),
        holderName: contact?.holderName ?? String(d.displayName ?? 'Titular'),
        displayName: String(d.displayName ?? ''),
        whatsapp: contact?.whatsapp ?? '',
        eventTitle: String(d.eventTitle ?? ''),
        eventDate: String(d.eventDate ?? ''),
        eventTime: String(d.eventTime ?? ''),
        venue: String(d.venue ?? ''),
        tierName: String(d.tierName ?? ''),
        quantity: Number(d.quantity ?? 1),
        totalCents: Number(d.totalCents ?? 0),
        mpPaymentId: String(d.mpPaymentId ?? ''),
        createdAt: formatTimestamp(d.createdAt),
        status:
          d.status === 'pago' || d.status === 'validado'
            ? (d.status as TicketStatus)
            : 'aguardando-pagamento',
        validatedAt: d.validatedAtLabel ? String(d.validatedAtLabel) : undefined,
      };
    });
    callbacks.onTickets(merged);
  };

  const guestQuery = query(
    collection(db, 'guest_list'),
    orderBy('createdAt', 'desc')
  );
  const unsubGuests = onSnapshot(
    guestQuery,
    (snapshot) => {
      const list: PreListEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          protocol: String(d.protocol ?? ''),
          fullName: String(d.fullName ?? ''),
          whatsapp: String(d.whatsapp ?? ''),
          modality: 'lista',
          eventTitle: String(d.eventTitle ?? ''),
          createdAt: formatTimestamp(d.createdAt),
          status: d.status === 'confirmado' ? 'confirmado' : 'aguardando',
        };
      });
      callbacks.onGuestList(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'guest_list');
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const ticketsQuery = query(
    collection(db, 'tickets'),
    orderBy('createdAt', 'desc')
  );
  const unsubTickets = onSnapshot(
    ticketsQuery,
    (snapshot) => {
      latestTicketsRaw = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      emitMergedTickets();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'tickets');
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubContacts = onSnapshot(
    collection(db, 'ticket_contacts'),
    (snapshot) => {
      const nextMap = new Map<string, { holderName: string; whatsapp: string }>();
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        nextMap.set(docSnap.id, {
          holderName: String(d.holderName ?? ''),
          whatsapp: String(d.whatsapp ?? ''),
        });
      }
      latestContactsMap = nextMap;
      emitMergedTickets();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'ticket_contacts');
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubGuests();
    unsubTickets();
    unsubContacts();
  };
}

export async function adminToggleGuestStatus(
  id: string,
  currentStatus: 'aguardando' | 'confirmado'
) {
  const nextStatus = currentStatus === 'confirmado' ? 'aguardando' : 'confirmado';
  const path = `guest_list/${id}`;
  try {
    const publicRef = doc(db, 'guest_list_public', id);
    const publicSnap = await getDoc(publicRef);
    const batch = writeBatch(db);
    const nowServer = serverTimestamp();

    batch.update(doc(db, 'guest_list', id), {
      status: nextStatus,
      updatedAt: nowServer,
    });

    if (publicSnap.exists()) {
      batch.update(publicRef, {
        status: nextStatus,
        updatedAt: nowServer,
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminRemoveGuest(id: string) {
  const path = `guest_list/${id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'guest_list', id));
    batch.delete(doc(db, 'guest_list_public', id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminUpdateTicketStatus(
  ticketCode: string,
  status: TicketStatus,
  validatedAtLabel?: string
) {
  const path = `tickets/${ticketCode}`;
  const updatePayload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (validatedAtLabel) {
    updatePayload.validatedAtLabel = validatedAtLabel.slice(0, 40);
  }
  try {
    await updateDoc(doc(db, 'tickets', ticketCode), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminSaveEvent(ev: EventEdition) {
  const path = `events/${ev.id}`;
  try {
    await setDoc(doc(db, 'events', ev.id), {
      ...ev,
      lineupHighlights:
        ev.lineupHighlights.length > 0
          ? ev.lineupHighlights.slice(0, 10)
          : ['Programação HZ PARTY'],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminUpdateEventStatus(
  id: string,
  status: EventEdition['status']
) {
  const path = `events/${id}`;
  try {
    const existingSnap = await getDoc(doc(db, 'events', id));
    if (!existingSnap.exists()) {
      const seed = INITIAL_EVENTS.find((e) => e.id === id);
      if (seed) {
        await adminSaveEvent({ ...seed, status });
        return;
      }
    }
    await updateDoc(doc(db, 'events', id), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
