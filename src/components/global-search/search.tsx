"use client";

import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { buttonStyles } from "@/components/ui/styles";
import { opensSearchDialog } from "./keyboard";
import { searchLiveStatus } from "./live-status";

const groups = [
  ["cases", "Sprawy i stanowiska"],
  ["companies", "Firmy"],
  ["contacts", "Kontakty"],
  ["links", "Linki"],
  ["notes", "Notatki"],
  ["events", "Wydarzenia"],
] as const;
type Group = (typeof groups)[number][0];
type Item = {
  id: string;
  case_id: string | null;
  title: string;
  snippet: string | null;
  source?: string | null;
  case_title?: string | null;
  role?: string | null;
  status?: string | null;
};
const roleLabels: Record<string, string> = {
  primary_offer: "Główne ogłoszenie",
  additional_offer: "Dodatkowe ogłoszenie",
  application_form: "Formularz aplikacji",
  company_site: "Strona firmy",
  profile: "Profil",
  correspondence: "Korespondencja",
  other: "Inne",
  unspecified: "Nieokreślona",
};
type Result = Record<Group, { items: Item[]; hasMore: boolean }>;
type Store = {
  owner: string | null;
  query: string;
  filter: string;
  pages: Partial<Record<Group, number>>;
};
const initial: Store = { owner: null, query: "", filter: "all", pages: {} };
let store = initial;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function emit(value: Store) {
  store = value;
  listeners.forEach((fn) => fn());
}
function ownerStore(owner: string) {
  return store.owner === owner ? store : { ...initial, owner };
}
function clear() {
  emit(initial);
}
function useSearchStore(owner: string) {
  const current = useSyncExternalStore(
    subscribe,
    () => store,
    () => initial,
  );
  useEffect(() => {
    if (store.owner !== owner) emit({ ...initial, owner });
    const client = getBrowserClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== owner))
        clear();
    });
    const pagehide = () => clear();
    window.addEventListener("pagehide", pagehide);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("pagehide", pagehide);
    };
  }, [owner]);
  return current.owner === owner ? current : initial;
}
function target(group: Group, item: Item): string {
  const id = encodeURIComponent(item.id);
  if (group === "companies") return `/companies/${id}`;
  if (group === "contacts") return `/contacts/${id}`;
  if (group === "events") return `/calendar?eventId=${id}`;
  const caseId = encodeURIComponent(item.case_id ?? item.id);
  if (group === "notes")
    return `/recruitments/${caseId}?noteId=${id}#case-history`;
  if (group === "links")
    return `/recruitments/${caseId}?linkId=${id}&linkSource=${encodeURIComponent(item.source ?? "additional")}#case-links`;
  return `/recruitments/${caseId}`;
}
export function SearchContent({
  userId,
  preview = false,
  onNavigate,
}: {
  userId: string;
  preview?: boolean;
  onNavigate?: () => void;
}) {
  const state = useSearchStore(userId);
  const [result, setResult] = useState<{ key: string; data: Result } | null>(
    null,
  );
  const [requestStatus, setRequestStatus] = useState<{
    key: string;
    value: "loading" | "success" | "error";
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const query = state.query.trim();
  const invalid =
    Array.from(query).length > 200 ||
    query.includes("\0") ||
    !query.isWellFormed();
  const pagesKey = JSON.stringify(preview ? {} : state.pages);
  const requestKey = JSON.stringify([userId, query, pagesKey, preview, retry]);
  useEffect(() => {
    if (!query || invalid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRequestStatus({ key: requestKey, value: "loading" });
      setResult(null);
      void fetch("/search/data", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUserId: userId,
          query,
          pages: JSON.parse(pagesKey),
          limit: preview ? 3 : 20,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) clear();
            throw new Error("search failed");
          }
          return (await response.json()) as Result;
        })
        .then((body) => {
          if (!controller.signal.aborted && store.owner === userId) {
            setResult({ key: requestKey, data: body });
            setRequestStatus({ key: requestKey, value: "success" });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && store.owner === userId) {
            setResult(null);
            setRequestStatus({ key: requestKey, value: "error" });
          }
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, invalid, userId, pagesKey, preview, retry, requestKey]);
  const setQuery = useCallback(
    (value: string) => emit({ ...ownerStore(userId), query: value, pages: {} }),
    [userId],
  );
  const setFilter = (filter: string) =>
    emit({ ...ownerStore(userId), filter, pages: {} });
  const setPage = (key: Group, page: number) =>
    emit({
      ...ownerStore(userId),
      pages: { ...ownerStore(userId).pages, [key]: page },
    });
  const shown = groups.filter(
    ([key]) => preview || state.filter === "all" || state.filter === key,
  );
  const currentResult = result?.key === requestKey ? result.data : null;
  const status =
    requestStatus?.key === requestKey ? requestStatus.value : "empty";
  const hasItems = Boolean(
    currentResult &&
    shown.some(([key]) => (currentResult[key]?.items.length ?? 0) > 0),
  );
  const hasResults =
    currentResult &&
    shown.some(
      ([key]) =>
        (currentResult[key]?.items.length ?? 0) > 0 ||
        (!preview && (state.pages[key] ?? 1) > 1),
    );
  return (
    <div className="min-w-0 space-y-5">
      <div>
        <label
          htmlFor={preview ? "search-overlay-input" : "search-page-input"}
          className="mb-1 block text-sm font-medium"
        >
          Szukaj w Jobs CRM
        </label>
        <input
          id={preview ? "search-overlay-input" : "search-page-input"}
          autoFocus={preview}
          value={state.query}
          onChange={(e) => setQuery(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? "search-invalid" : undefined}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
        {invalid && (
          <p
            id="search-invalid"
            role="alert"
            className="text-sm text-destructive"
          >
            Wpisz maksymalnie 200 poprawnych znaków.
          </p>
        )}
      </div>
      {!preview && (
        <div>
          <label
            htmlFor="search-filter"
            className="mb-1 block text-sm font-medium"
          >
            Typ wyników
          </label>
          <select
            id="search-filter"
            value={state.filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 sm:w-auto"
          >
            <option value="all">Wszystkie typy</option>
            {groups.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {!query && !invalid && (
        <p className="text-sm text-muted-foreground">Wpisz, czego szukasz.</p>
      )}
      <p role="status" className="sr-only">
        {searchLiveStatus(
          Boolean(query) && !invalid,
          status,
          Boolean(currentResult),
          hasItems,
        )}
      </p>
      {query &&
        !invalid &&
        (status === "empty" ||
          status === "loading" ||
          (status === "success" && !currentResult)) && <p>Szukam…</p>}
      {query && !invalid && status === "error" && (
        <div>
          <p>Nie udało się pobrać wyników.</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => setRetry((n) => n + 1)}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      {query && !invalid && status === "success" && currentResult && (
        <>
          {!hasResults ? (
            <p>Brak wyników. Spróbuj innej frazy.</p>
          ) : (
            shown.map(([key, label]) => {
              const group = currentResult[key];
              const page = state.pages[key] ?? 1;
              if (!group || (!group.items.length && (preview || page === 1)))
                return null;
              return (
                <section key={key} aria-label={label} className="min-w-0">
                  <h2 className="text-base font-semibold">{label}</h2>
                  <ul className="mt-2 divide-y divide-border">
                    {group.items.length === 0 && (
                      <li className="py-2 text-sm">
                        Brak wyników na tej stronie.
                      </li>
                    )}
                    {group.items.map((item) => (
                      <li
                        key={`${item.source ?? ""}:${item.id}`}
                        className="py-2"
                      >
                        <Link
                          onClick={onNavigate}
                          href={target(key, item)}
                          className="ui-link block min-h-11 break-words py-2 [overflow-wrap:anywhere]"
                        >
                          <span className="font-medium">{item.title}</span>
                          {item.status && (
                            <span className="ml-2 text-sm text-muted-foreground">
                              {item.status}
                            </span>
                          )}
                          {item.role && (
                            <span className="block text-sm">
                              {roleLabels[item.role] ?? item.role}
                            </span>
                          )}
                          {item.case_title && key !== "cases" && (
                            <span className="block text-sm text-muted-foreground">
                              {item.case_title}
                            </span>
                          )}
                          {key === "events" && !item.case_id && (
                            <span className="block text-sm text-muted-foreground">
                              Wydarzenie ogólne
                            </span>
                          )}
                          {item.snippet && (
                            <span className="block whitespace-pre-wrap text-sm text-muted-foreground">
                              {item.snippet}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!preview && (
                    <nav
                      aria-label={`Strony: ${label}`}
                      className="mt-2 flex items-center gap-3"
                    >
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        disabled={page <= 1}
                        onClick={() => setPage(key, page - 1)}
                        aria-label={`Poprzednia strona ${label}`}
                      >
                        Poprzednia
                      </button>
                      <span>Strona {page}</span>
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        disabled={!group.hasMore}
                        onClick={() => setPage(key, page + 1)}
                        aria-label={`Następna strona ${label}`}
                      >
                        Następna
                      </button>
                    </nav>
                  )}
                </section>
              );
            })
          )}
        </>
      )}
      {preview && (
        <Link
          href="/search"
          onClick={onNavigate}
          className={`${buttonStyles.secondary} inline-flex`}
        >
          Wszystkie wyniki
        </Link>
      )}
    </div>
  );
}
export function GlobalSearch({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const state = useSearchStore(userId);
  const composing = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const navigating = useRef(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <input
        aria-label="Szukaj w Jobs CRM"
        placeholder="Szukaj w Jobs CRM"
        type="search"
        value={state.query}
        onChange={(event) => {
          emit({ ...ownerStore(userId), query: event.target.value, pages: {} });
          if (!composing.current) {
            opener.current = event.currentTarget;
            navigating.current = false;
            setOpen(true);
          }
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          emit({
            ...ownerStore(userId),
            query: event.currentTarget.value,
            pages: {},
          });
          opener.current = event.currentTarget;
          navigating.current = false;
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (opensSearchDialog(event.key, event.nativeEvent.isComposing)) {
            event.preventDefault();
            opener.current = event.currentTarget;
            navigating.current = false;
            setOpen(true);
          }
        }}
        onClick={(event) => {
          opener.current = event.currentTarget;
          navigating.current = false;
          setOpen(true);
        }}
        className="hidden min-h-11 w-44 rounded-md border border-input bg-background px-3 text-sm lg:block"
      />
      <Dialog.Trigger
        aria-label="Szukaj"
        className={`${buttonStyles.secondary} min-w-11 gap-2`}
        onClick={(event) => {
          opener.current = event.currentTarget;
          navigating.current = false;
        }}
      >
        <Search aria-hidden="true" size={18} />
        <span className="hidden sm:inline">Szukaj</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Popup
          finalFocus={() => (navigating.current ? false : opener.current)}
          className="fixed inset-x-3 top-4 z-50 mx-auto max-h-[calc(100dvh-2rem)] w-auto max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl outline-none sm:top-[10vh]"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              Wyszukiwanie
            </Dialog.Title>
            <Dialog.Close
              aria-label="Zamknij wyszukiwanie"
              className={buttonStyles.ghost}
            >
              <X aria-hidden="true" size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Wyszukaj w swojej przestrzeni.
          </Dialog.Description>
          <SearchContent
            userId={userId}
            preview
            onNavigate={() => {
              navigating.current = true;
              setOpen(false);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
