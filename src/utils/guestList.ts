export interface GuestListSortable {
  id: string;
  protocol: string;
  fullName: string;
}

export function normalizeGuestQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function sortGuestListAlphabetically<T extends GuestListSortable>(
  entries: readonly T[]
): T[] {
  return [...entries].sort((a, b) => {
    const cmp = a.fullName.localeCompare(b.fullName, 'pt-BR', {
      sensitivity: 'base',
    });
    if (cmp !== 0) return cmp;
    return a.protocol.localeCompare(b.protocol);
  });
}

export function filterGuestListByQuery<T extends GuestListSortable>(
  entries: readonly T[],
  rawQuery: string
): T[] {
  const sorted = sortGuestListAlphabetically(entries);
  const q = normalizeGuestQuery(rawQuery);
  if (!q) return sorted;

  return sorted.filter(
    (entry) =>
      normalizeGuestQuery(entry.fullName).includes(q) ||
      normalizeGuestQuery(entry.protocol).includes(q)
  );
}
