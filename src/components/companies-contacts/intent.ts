import type { CatalogCommand } from "@/modules/companies-contacts/domain/catalog";

export type CatalogReadState<T> = {
  scope: string;
  data: T | null;
  error: boolean;
  loading: boolean;
};
/** Only the same account and exact query may retain confirmed data during refetch. */
export function catalogReadTransition<T>(
  previous: CatalogReadState<T>,
  scope: string,
  retainConfirmed: boolean,
  failed = false,
): CatalogReadState<T> {
  return {
    scope,
    data: retainConfirmed && previous.scope === scope ? previous.data : null,
    error: failed,
    loading: !failed,
  };
}
/** A duplicate acknowledgement is a new intention only before any ambiguous dispatch. */
export function acknowledgedCatalogCommand(
  command: CatalogCommand | null,
  matches: string[] | null,
  locked: boolean,
  makeRequestId: () => string,
): CatalogCommand | null {
  if (locked || !command || !matches) return null;
  return {
    ...command,
    requestId: makeRequestId(),
    acknowledgedMatches: [...matches],
  };
}
/** Uncertainty freezes the exact dispatched object; retry reuses that object and key. */
export function mayDispatchCatalogCommand(
  current: CatalogCommand | null,
  next: CatalogCommand,
  busy: boolean,
  uncertain: boolean,
) {
  return !busy && (!uncertain || current === next);
}
