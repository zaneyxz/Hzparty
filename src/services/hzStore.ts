import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
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
  Promoter,
  PublicGuestListEntry,
  TicketReservation,
  TicketStatus,
} from '../types/hz';
import { sortGuestListAlphabetically } from '../utils/guestList';
import { generateVisualCode } from '../utils/ticketing';
import { splitFullName } from '../utils/mercadoPago';
import {
  formatValidationDateTime,
  parseTicketQrPayload,
  type TicketScanResult,
} from '../utils/qrScanner';
import {
  mapMercadoPagoRawStatusToTicketStatus,
  normalizePromoterCode,
} from '../utils/promoters';
import { checkMercadoPagoPaymentStatus } from './paymentsApi';

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

function formatTimestampDateTime(ts: unknown): string | undefined {
  if (ts instanceof Timestamp) {
    return formatValidationDateTime(ts.toDate());
  }
  return undefined;
}

function getTimestampMillis(ts: unknown): number | undefined {
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  return undefined;
}

function normalizeStoredTicketStatus(raw: unknown): TicketStatus {
  if (raw === 'pago' || raw === 'validado' || raw === 'cancelado') {
    return raw;
  }
  return 'aguardando-pagamento';
}

export function isVerifiedAdminEmail(email: string | null | undefined, emailVerified: boolean | undefined): boolean {
  return Boolean(emailVerified && email && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase());
}

export async function checkAuthorizedAdminAccess(user: {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}): Promise<boolean> {
  if (!user.emailVerified) return false;
  if (isVerifiedAdminEmail(user.email, user.emailVerified)) return true;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
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

export function subscribePublicPromoters(
  onData: (promoters: Promoter[]) => void
): Unsubscribe {
  const promotersRef = collection(db, 'promoters');
  return onSnapshot(
    promotersRef,
    (snapshot) => {
      const list: Promoter[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          return {
            id: String(d.id ?? docSnap.id),
            name: String(d.name ?? ''),
            code: normalizePromoterCode(String(d.code ?? '')),
            active: Boolean(d.active),
            createdAt: formatTimestampDateTime(d.createdAt) ?? formatTimestamp(d.createdAt),
            createdAtMs: getTimestampMillis(d.createdAt),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      onData(list);
    },
    (error) => {
      console.error('Public promoters subscription warning:', error.message);
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
  promoter?: {
    id: string;
    name: string;
    code: string;
  } | null;
}): Promise<TicketReservation> {
  const { displayName } = splitFullName(input.holderName);
  const holderName = input.holderName.trim().slice(0, 120);
  const whatsapp = input.whatsapp.trim().slice(0, 20);
  const ticketCode = input.ticketCode.trim().toUpperCase();

  const batch = writeBatch(db);
  const ticketRef = doc(db, 'tickets', ticketCode);
  const contactRef = doc(db, 'ticket_contacts', ticketCode);

  const ticketDoc: Record<string, unknown> = {
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
  };

  let savedPromoterId: string | undefined;
  let savedPromoterName: string | undefined;
  let savedPromoterCode: string | undefined;

  if (input.promoter) {
    const cleanCode = normalizePromoterCode(input.promoter.code);
    const cleanName = input.promoter.name.trim().slice(0, 80);
    const cleanId = input.promoter.id.trim().slice(0, 64);
    if (cleanId.length >= 2 && cleanName.length >= 2 && cleanCode.length >= 2) {
      ticketDoc.promoterId = cleanId;
      ticketDoc.promoterName = cleanName;
      ticketDoc.promoterCode = cleanCode;
      savedPromoterId = cleanId;
      savedPromoterName = cleanName;
      savedPromoterCode = cleanCode;
    }
  }

  batch.set(ticketRef, ticketDoc);

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

  const now = new Date();
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
    createdAt: now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    createdAtMs: now.getTime(),
    createdAtFull: formatValidationDateTime(now),
    status: 'aguardando-pagamento',
    promoterId: savedPromoterId,
    promoterName: savedPromoterName,
    promoterCode: savedPromoterCode,
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
      createdAtMs: getTimestampMillis(d.createdAt),
      createdAtFull: formatTimestampDateTime(d.createdAt),
      status: normalizeStoredTicketStatus(d.status),
      validatedAt: d.validatedAtLabel ? String(d.validatedAtLabel) : undefined,
      promoterId: d.promoterId ? String(d.promoterId) : undefined,
      promoterName: d.promoterName ? String(d.promoterName) : undefined,
      promoterCode: d.promoterCode ? String(d.promoterCode) : undefined,
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
        createdAtMs: getTimestampMillis(d.createdAt),
        createdAtFull: formatTimestampDateTime(d.createdAt),
        status: normalizeStoredTicketStatus(d.status),
        validatedAt: d.validatedAtLabel ? String(d.validatedAtLabel) : undefined,
        promoterId: d.promoterId ? String(d.promoterId) : undefined,
        promoterName: d.promoterName ? String(d.promoterName) : undefined,
        promoterCode: d.promoterCode ? String(d.promoterCode) : undefined,
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

function buildTicketFromFirestoreDocs(
  ticketCode: string,
  ticketData: Record<string, unknown>,
  contactData: Record<string, unknown> | null
): TicketReservation {
  return {
    id: ticketCode,
    ticketCode: String(ticketData.ticketCode ?? ticketCode),
    holderName:
      (contactData?.holderName ? String(contactData.holderName) : '') ||
      String(ticketData.displayName ?? 'Titular'),
    displayName: String(ticketData.displayName ?? ''),
    whatsapp: contactData?.whatsapp ? String(contactData.whatsapp) : '',
    eventTitle: String(ticketData.eventTitle ?? ''),
    eventDate: String(ticketData.eventDate ?? ''),
    eventTime: String(ticketData.eventTime ?? ''),
    venue: String(ticketData.venue ?? ''),
    tierName: String(ticketData.tierName ?? ''),
    quantity: Number(ticketData.quantity ?? 1),
    totalCents: Number(ticketData.totalCents ?? 0),
    mpPaymentId: String(ticketData.mpPaymentId ?? ''),
    createdAt: formatTimestamp(ticketData.createdAt),
    createdAtMs: getTimestampMillis(ticketData.createdAt),
    createdAtFull: formatTimestampDateTime(ticketData.createdAt),
    status: normalizeStoredTicketStatus(ticketData.status),
    validatedAt: ticketData.validatedAtLabel
      ? String(ticketData.validatedAtLabel)
      : formatTimestampDateTime(ticketData.updatedAt),
    promoterId: ticketData.promoterId ? String(ticketData.promoterId) : undefined,
    promoterName: ticketData.promoterName ? String(ticketData.promoterName) : undefined,
    promoterCode: ticketData.promoterCode ? String(ticketData.promoterCode) : undefined,
  };
}

/**
 * Real-time atomic Firestore check-in for the QR Code scanner.
 * Uses Firestore runTransaction to prevent concurrent double-validation across devices,
 * and verifies live Mercado Pago status if the ticket document is still marked
 * 'aguardando-pagamento' (since non-admin buyers cannot update Firestore directly).
 */
export async function adminScanAndValidateTicket(
  rawQrPayload: string
): Promise<TicketScanResult> {
  const scannedAt = formatValidationDateTime(new Date());
  const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const parsed = parseTicketQrPayload(rawQrPayload);

  if (!parsed.valid || !parsed.ticketCode) {
    return {
      id: scanId,
      outcome: 'invalid',
      scannedAt,
      rawInput: parsed.rawValue || rawQrPayload.trim().slice(0, 120),
      ticketCode: null,
      message: 'QR Code inválido — formato não pertence aos ingressos oficiais da HZ PARTY.',
    };
  }

  if (!auth.currentUser) {
    return {
      id: scanId,
      outcome: 'error',
      scannedAt,
      rawInput: parsed.rawValue,
      ticketCode: parsed.ticketCode,
      message: 'Sessão administrativa expirada. Faça login novamente para validar ingressos.',
    };
  }

  const ticketCode = parsed.ticketCode;
  const ticketRef = doc(db, 'tickets', ticketCode);
  const contactRef = doc(db, 'ticket_contacts', ticketCode);

  type TxPhaseResult =
    | { phase: 'invalid' }
    | { phase: 'already-used'; ticket: TicketReservation; firstUsedAt: string }
    | { phase: 'valid'; ticket: TicketReservation; validatedAtLabel: string }
    | { phase: 'needs-mp-check'; ticket: TicketReservation };

  try {
    const firstPass = await runTransaction<TxPhaseResult>(db, async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists()) {
        return { phase: 'invalid' };
      }

      const contactSnap = await tx.get(contactRef);
      const ticketData = ticketSnap.data() as Record<string, unknown>;
      const contactData = contactSnap.exists()
        ? (contactSnap.data() as Record<string, unknown>)
        : null;
      const ticket = buildTicketFromFirestoreDocs(ticketCode, ticketData, contactData);

      if (ticket.status === 'validado') {
        const firstUsedAt =
          ticket.validatedAt ||
          formatTimestampDateTime(ticketData.updatedAt) ||
          'Horário anterior registrado';
        return { phase: 'already-used', ticket, firstUsedAt };
      }

      if (ticket.status === 'pago') {
        const validatedAtLabel = formatValidationDateTime(new Date());
        tx.update(ticketRef, {
          status: 'validado',
          updatedAt: serverTimestamp(),
          validatedAtLabel,
        });
        return {
          phase: 'valid',
          ticket: {
            ...ticket,
            status: 'validado',
            validatedAt: validatedAtLabel,
          },
          validatedAtLabel,
        };
      }

      return { phase: 'needs-mp-check', ticket };
    });

    if (firstPass.phase === 'invalid') {
      return {
        id: scanId,
        outcome: 'invalid',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        message: `Código ${ticketCode} não encontrado no Firebase. Entrada não permitida.`,
      };
    }

    if (firstPass.phase === 'already-used') {
      return {
        id: scanId,
        outcome: 'already-used',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        ticket: firstPass.ticket,
        validatedAt: firstPass.firstUsedAt,
        message: 'Este ingresso já foi validado anteriormente. Segunda entrada bloqueada.',
      };
    }

    if (firstPass.phase === 'valid') {
      return {
        id: scanId,
        outcome: 'valid',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        ticket: firstPass.ticket,
        validatedAt: firstPass.validatedAtLabel,
        message: 'Ingresso válido e registrado como UTILIZADO no Firebase.',
      };
    }

    // Status was 'aguardando-pagamento': verify live Mercado Pago payment before approving
    let isPaidInMp = false;
    let mpRawStatus = 'pendente';
    if (firstPass.ticket.mpPaymentId) {
      try {
        const mp = await checkMercadoPagoPaymentStatus(firstPass.ticket.mpPaymentId);
        mpRawStatus = mp.status;
        isPaidInMp = mp.normalizedStatus === 'pago';
      } catch {
        isPaidInMp = false;
      }
    }

    if (!isPaidInMp) {
      return {
        id: scanId,
        outcome: 'unpaid',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        ticket: firstPass.ticket,
        message: `Pagamento Pix ainda não confirmado (${mpRawStatus}). Entrada bloqueada até confirmação.`,
      };
    }

    // Payment confirmed live by Mercado Pago: run atomic transaction to mark UTILIZADO once
    const secondPass = await runTransaction<
      | { phase: 'invalid' }
      | { phase: 'already-used'; ticket: TicketReservation; firstUsedAt: string }
      | { phase: 'valid'; ticket: TicketReservation; validatedAtLabel: string }
    >(db, async (tx) => {
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists()) {
        return { phase: 'invalid' };
      }

      const contactSnap = await tx.get(contactRef);
      const ticketData = ticketSnap.data() as Record<string, unknown>;
      const contactData = contactSnap.exists()
        ? (contactSnap.data() as Record<string, unknown>)
        : null;
      const ticket = buildTicketFromFirestoreDocs(ticketCode, ticketData, contactData);

      if (ticket.status === 'validado') {
        const firstUsedAt =
          ticket.validatedAt ||
          formatTimestampDateTime(ticketData.updatedAt) ||
          'Horário anterior registrado';
        return { phase: 'already-used', ticket, firstUsedAt };
      }

      const validatedAtLabel = formatValidationDateTime(new Date());
      tx.update(ticketRef, {
        status: 'validado',
        updatedAt: serverTimestamp(),
        validatedAtLabel,
      });
      return {
        phase: 'valid',
        ticket: {
          ...ticket,
          status: 'validado',
          validatedAt: validatedAtLabel,
        },
        validatedAtLabel,
      };
    });

    if (secondPass.phase === 'invalid') {
      return {
        id: scanId,
        outcome: 'invalid',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        message: `Código ${ticketCode} não encontrado no Firebase. Entrada não permitida.`,
      };
    }

    if (secondPass.phase === 'already-used') {
      return {
        id: scanId,
        outcome: 'already-used',
        scannedAt,
        rawInput: parsed.rawValue,
        ticketCode,
        ticket: secondPass.ticket,
        validatedAt: secondPass.firstUsedAt,
        message: 'Este ingresso já foi validado anteriormente. Segunda entrada bloqueada.',
      };
    }

    return {
      id: scanId,
      outcome: 'valid',
      scannedAt,
      rawInput: parsed.rawValue,
      ticketCode,
      ticket: secondPass.ticket,
      validatedAt: secondPass.validatedAtLabel,
      syncedFromMp: true,
      message: 'Pagamento confirmado via Mercado Pago e ingresso registrado como UTILIZADO.',
    };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const isPermission =
      rawMsg.toLowerCase().includes('permission') ||
      rawMsg.toLowerCase().includes('insufficient');
    return {
      id: scanId,
      outcome: 'error',
      scannedAt,
      rawInput: parsed.rawValue,
      ticketCode,
      message: isPermission
        ? 'Permissão negada pelo Firebase. Apenas administradores ou equipe autorizada podem validar ingressos.'
        : 'Falha de conexão com o Firebase durante a validação. Tente escanear novamente.',
    };
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

export async function adminCreatePromoter(input: {
  name: string;
  code: string;
  active: boolean;
}) {
  const cleanCode = normalizePromoterCode(input.code);
  const cleanName = input.name.trim().slice(0, 80);
  const promoterId = `prom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `promoters/${promoterId}`;
  const nowServer = serverTimestamp();

  try {
    await setDoc(doc(db, 'promoters', promoterId), {
      id: promoterId,
      name: cleanName,
      code: cleanCode,
      active: Boolean(input.active),
      createdAt: nowServer,
      updatedAt: nowServer,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminUpdatePromoter(
  promoterId: string,
  input: { name: string; code: string; active: boolean }
) {
  const cleanCode = normalizePromoterCode(input.code);
  const cleanName = input.name.trim().slice(0, 80);
  const path = `promoters/${promoterId}`;

  try {
    await updateDoc(doc(db, 'promoters', promoterId), {
      name: cleanName,
      code: cleanCode,
      active: Boolean(input.active),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminTogglePromoterActive(
  promoterId: string,
  currentActive: boolean
) {
  const path = `promoters/${promoterId}`;
  try {
    await updateDoc(doc(db, 'promoters', promoterId), {
      active: !currentActive,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeletePromoter(promoterId: string) {
  const path = `promoters/${promoterId}`;
  try {
    await deleteDoc(doc(db, 'promoters', promoterId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Queries Mercado Pago live for every pending ticket with an mpPaymentId
 * and updates Firestore to 'pago' (approved) or 'cancelado' (cancelled/rejected/refunded).
 */
export async function adminSyncPendingMercadoPagoPayments(
  reservations: TicketReservation[]
): Promise<{ checked: number; approved: number; cancelled: number }> {
  const pending = reservations.filter(
    (r) => r.status === 'aguardando-pagamento' && Boolean(r.mpPaymentId)
  );

  let approved = 0;
  let cancelled = 0;

  for (const ticket of pending) {
    try {
      const mp = await checkMercadoPagoPaymentStatus(ticket.mpPaymentId);
      const nextStatus = mapMercadoPagoRawStatusToTicketStatus(mp.status);
      if (nextStatus === 'pago') {
        await adminUpdateTicketStatus(ticket.ticketCode, 'pago');
        approved += 1;
      } else if (nextStatus === 'cancelado') {
        await adminUpdateTicketStatus(ticket.ticketCode, 'cancelado');
        cancelled += 1;
      }
    } catch {
      // Skip transient single-payment errors and continue syncing others
    }
  }

  return { checked: pending.length, approved, cancelled };
}
