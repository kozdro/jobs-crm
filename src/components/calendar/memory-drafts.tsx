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
type Store = { ownerId: string | null; drafts: MemoryDraft[] };
type Context = {
  store: Store;
  activate: (owner: string) => void;
  save: (draft: MemoryDraft) => void;
  remove: (owner: string, id: string, expected: MemoryDraft) => void;
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
      setStore((current) =>
        current.ownerId !== owner
          ? current
          : {
              ...current,
              drafts: current.drafts.filter(
                (d) => d.id !== id || d !== expected,
              ),
            },
      ),
    [],
  );
  const value = useMemo(
    () => ({ store, activate, save, remove }),
    [store, activate, save, remove],
  );
  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
}
export function useCalendarMemoryDrafts() {
  return useContext(DraftContext);
}
