"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CalendarValues,
  CalendarCommandInput,
} from "@/modules/recruitment/domain/calendar";
export type MemoryDraft = {
  id: string;
  ownerId: string;
  eventId: string | null;
  mode: "create" | "occurred" | "edit" | "resolve";
  values: CalendarValues;
  zoneDraft: string;
  zoneMode: "" | "wall" | "instant";
  zoneChangeMode?: CalendarCommandInput["zoneChangeMode"];
  pendingRequestId?: string;
  pendingCommand?: CalendarCommandInput;
};
export type Store = { ownerId: string | null; drafts: MemoryDraft[] };
/** Only the exact snapshot may be consumed; another owner or newer revision wins. */
export function withoutMatchingDraft(
  current: Store,
  owner: string,
  id: string,
  expected: MemoryDraft,
): Store {
  if (current.ownerId !== owner) return current;
  return {
    ...current,
    drafts: current.drafts.filter((d) => d.id !== id || d !== expected),
  };
}
/** Reverted input is no longer a draft, except restored or pending commands. */
export function revertedDraftCandidate(
  dirty: boolean,
  restored: boolean,
  pending: boolean,
  entry: MemoryDraft | null,
): MemoryDraft | null {
  return !dirty &&
    !restored &&
    !pending &&
    entry &&
    !entry.pendingRequestId &&
    !entry.pendingCommand
    ? entry
    : null;
}
/** Remove rejected command metadata only from the exact frozen intent. */
export function stripRejectedDraftMetadata(
  owner: string,
  id: string,
  entry: MemoryDraft | null,
  command: CalendarCommandInput,
): MemoryDraft | null {
  if (
    !entry ||
    entry.ownerId !== owner ||
    entry.id !== id ||
    entry.pendingRequestId !== command.requestId ||
    entry.pendingCommand !== command
  )
    return null;
  const clean = { ...entry };
  delete clean.pendingRequestId;
  delete clean.pendingCommand;
  return clean;
}
/** Compare-and-swap protects a newer snapshot and another owner. */
export function replaceMatchingDraft(
  current: Store,
  owner: string,
  id: string,
  expected: MemoryDraft,
  replacement: MemoryDraft,
): Store {
  if (
    current.ownerId !== owner ||
    replacement.ownerId !== owner ||
    replacement.id !== id
  )
    return current;
  if (!current.drafts.some((d) => d.id === id && d === expected))
    return current;
  return {
    ...current,
    drafts: current.drafts.map((d) =>
      d.id === id && d === expected ? replacement : d,
    ),
  };
}
type Context = {
  store: Store;
  activate: (owner: string) => void;
  save: (draft: MemoryDraft) => void;
  remove: (owner: string, id: string, expected: MemoryDraft) => void;
  replace: (
    owner: string,
    id: string,
    expected: MemoryDraft,
    replacement: MemoryDraft,
  ) => void;
};
const DraftContext = createContext<Context | null>(null);
export function CalendarMemoryDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store, setStore] = useState<Store>({ ownerId: null, drafts: [] });
  const activate = useCallback(
    (ownerId: string) =>
      setStore((current) =>
        current.ownerId === ownerId ? current : { ownerId, drafts: [] },
      ),
    [],
  );
  const save = useCallback(
    (draft: MemoryDraft) =>
      setStore((current) => ({
        ownerId: draft.ownerId,
        drafts: [
          ...(current.ownerId === draft.ownerId
            ? current.drafts.filter((d) => d.id !== draft.id)
            : []),
          draft,
        ],
      })),
    [],
  );
  const remove = useCallback(
    (owner: string, id: string, expected: MemoryDraft) =>
      setStore((current) => withoutMatchingDraft(current, owner, id, expected)),
    [],
  );
  const replace = useCallback(
    (
      owner: string,
      id: string,
      expected: MemoryDraft,
      replacement: MemoryDraft,
    ) =>
      setStore((current) =>
        replaceMatchingDraft(current, owner, id, expected, replacement),
      ),
    [],
  );
  const value = useMemo(
    () => ({ store, activate, save, remove, replace }),
    [store, activate, save, remove, replace],
  );
  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
}
export function useCalendarMemoryDrafts() {
  return useContext(DraftContext);
}
