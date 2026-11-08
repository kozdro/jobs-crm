"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ReminderDraft = {
  kind: "reminder";
  date: string;
  time: string;
  zone: string;
  offset: number | null;
};
export type RuleDraft = { kind: "rule"; days: string; zone: string };
export type Draft = ReminderDraft | RuleDraft;
type Store = { owner: string | null; entries: Record<string, Draft> };
type Context = {
  store: Store;
  activate: (owner: string) => void;
  reset: () => void;
  save: (owner: string, key: string, draft: Draft) => void;
  clear: (owner: string, key: string, expected: Draft) => void;
};
const DraftContext = createContext<Context | null>(null);
export function clearMatchingDraft(
  store: Store,
  owner: string,
  key: string,
  expected: Draft,
): Store {
  if (store.owner !== owner || store.entries[key] !== expected) return store;
  const entries = { ...store.entries };
  delete entries[key];
  return { ...store, entries };
}
export function ReminderDraftProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>({ owner: null, entries: {} });
  const reset = useCallback(() => setStore({ owner: null, entries: {} }), []);
  const activate = useCallback(
    (owner: string) =>
      setStore((current) =>
        current.owner === owner ? current : { owner, entries: {} },
      ),
    [],
  );
  useEffect(() => {
    if (!Object.keys(store.entries).length) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [store.entries]);
  const save = useCallback(
    (owner: string, key: string, draft: Draft) =>
      setStore((current) => ({
        owner,
        entries: {
          ...(current.owner === owner ? current.entries : {}),
          [key]: draft,
        },
      })),
    [],
  );
  const clear = useCallback(
    (owner: string, key: string, expected: Draft) =>
      setStore((current) => clearMatchingDraft(current, owner, key, expected)),
    [],
  );
  const value = useMemo(
    () => ({ store, activate, reset, save, clear }),
    [store, activate, reset, save, clear],
  );
  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
}
export function useReminderDrafts() {
  return useContext(DraftContext);
}
