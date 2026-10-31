"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";
import {
  defaultWorkspaceQuery,
  workspaceSearchParams,
  type WorkspaceQuery,
  type WorkspaceData,
  type WorkspaceCase,
  type WorkspacePage,
  type WorkspacePreview,
  type WorkspaceProfilePage,
} from "@/modules/recruitment/domain/workspace";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { CaseCreatedTime, CaseStatus } from "./case-content";
import {
  clearWorkspaceNavigation,
  findWorkspaceNavigation,
  rememberWorkspaceNavigation,
} from "./workspace-navigation";

type Status = RecruitmentCase["status"];
const statuses: Status[] = [
  "Zapisane",
  "Kontakt rozpoczęty",
  "W rekrutacji",
  "Zakończone",
];
const control = `${inputStyles} min-h-11 w-full`;
export function resetWorkspacePages(query: WorkspaceQuery): WorkspaceQuery {
  return {
    ...query,
    page: 1,
    columnPages: defaultWorkspaceQuery().columnPages,
  };
}
export function workspacePreset(
  query: WorkspaceQuery,
  preset: "all" | "active" | "closed",
): WorkspaceQuery {
  return resetWorkspacePages({
    ...query,
    statuses:
      preset === "all"
        ? [...statuses]
        : preset === "active"
          ? statuses.slice(0, 3)
          : ["Zakończone"],
    closedOpen: preset === "closed" ? true : query.closedOpen,
  });
}
export function workspacePresetName(query: WorkspaceQuery) {
  if (query.statuses.length === 4) return "all";
  if (query.statuses.length === 1 && query.statuses[0] === "Zakończone")
    return "closed";
  if (query.statuses.length === 3 && !query.statuses.includes("Zakończone"))
    return "active";
  return null;
}
const focusables =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
function shown(element: HTMLElement) {
  return (
    element.getClientRects().length > 0 && !element.closest("[hidden],[inert]")
  );
}
async function readData<T>(
  userId: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<T> {
  params.set("expectedUserId", userId);
  const response = await fetch(`/recruitments/workspace-data?${params}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(response.status === 404 ? "missing" : "unavailable");
  return response.json() as Promise<T>;
}
function OrganizationNames({ item }: { item: WorkspaceCase }) {
  return (
    <>
      {item.organizations.length > 0 && (
        <ul
          className="mt-2 space-y-1 text-[13px] leading-5 text-muted-foreground"
          aria-label="Powiązane organizacje"
        >
          {item.organizations.map((org, index) => (
            <li
              key={`${org.id}:${org.role}:${index}`}
              className="[overflow-wrap:anywhere]"
            >
              {org.name}{" "}
              <span>
                ({org.role === "employer" ? "pracodawca" : "agencja"})
              </span>
            </li>
          ))}
        </ul>
      )}
      {item.organizationsHasMore && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Fragment powiązań — pozostałe na pełnej stronie sprawy.
        </p>
      )}
    </>
  );
}
export function WorkspaceRecord({
  item,
  select,
}: {
  item: WorkspaceCase;
  select?: (id: string, element: HTMLButtonElement) => void;
}) {
  return (
    <li className="min-w-0 border-b border-border p-4 last:border-b-0">
      <h3 className="text-[15px] font-semibold leading-6 [overflow-wrap:anywhere]">
        <button
          type="button"
          className="min-h-11 max-w-full text-left hover:text-primary hover:underline underline-offset-4 [overflow-wrap:anywhere]"
          onClick={(event) => select?.(item.id, event.currentTarget)}
        >
          {item.title}
        </button>
      </h3>
      <div className="mt-1">
        <CaseStatus status={item.status} />
      </div>
      {item.current_stage && (
        <p className="mt-2 text-sm [overflow-wrap:anywhere]">
          <span className="text-muted-foreground">Etap: </span>
          {item.current_stage}
        </p>
      )}
      <OrganizationNames item={item} />
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
        Dodano do CRM <CaseCreatedTime value={item.created_at} />
      </p>
    </li>
  );
}
function PageNavigation({
  result,
  label,
  change,
}: {
  result: WorkspacePage;
  label: string;
  change: (page: number) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center gap-2 border-t border-border p-3 text-[13px]"
    >
      {result.page > 1 && (
        <button
          type="button"
          className={buttonStyles.ghost}
          onClick={() => change(result.page - 1)}
        >
          Poprzednia strona
        </button>
      )}
      <span>Strona {result.page}</span>
      {result.hasMore && (
        <button
          type="button"
          className={buttonStyles.ghost}
          onClick={() => change(result.page + 1)}
        >
          Dalsze wyniki
        </button>
      )}
    </nav>
  );
}
function ProfileSelect({
  userId,
  type,
  value,
  onChange,
}: {
  userId: string;
  type: "organization" | "contact";
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      mode: "options",
      type,
      page: String(page),
    });
    void readData<WorkspaceProfilePage>(userId, params, controller.signal)
      .then((result) => {
        if (!active) return;
        setItems((previous) => {
          const merged = page === 1 ? [] : previous;
          return [...merged, ...result.profiles].filter(
            (profile, index, all) =>
              all.findIndex((p) => p.id === profile.id) === index,
          );
        });
        setMore(result.hasMore);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, type, page, retry]);
  useEffect(() => {
    if (!value || items.some((item) => item.id === value)) return;
    const controller = new AbortController();
    void readData<WorkspaceProfilePage>(
      userId,
      new URLSearchParams({ mode: "options", type, id: value }),
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted && result.profiles.length > 0)
          setItems((previous) =>
            [...previous, ...result.profiles].filter(
              (profile, index, all) =>
                all.findIndex((p) => p.id === profile.id) === index,
            ),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [value, items, type, userId]);
  const label = type === "organization" ? "Organizacja" : "Osoba kontaktowa";
  return (
    <div className="min-w-0">
      <label className="block text-sm font-medium">
        {label}
        <select
          className={`${control} mt-2`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          aria-busy={pending}
        >
          <option value="">Wszystkie</option>
          {value && !items.some((item) => item.id === value) && (
            <option value={value}>Wybrany profil — niedostępna nazwa</option>
          )}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {more && (
        <button
          type="button"
          disabled={pending || error}
          className="ui-link mt-1 min-h-11 text-left text-[13px]"
          onClick={() => {
            setPending(true);
            setError(false);
            setPage((old) => old + 1);
          }}
        >
          Pokaż dalsze {type === "organization" ? "organizacje" : "osoby"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[13px] text-destructive">
          Nie udało się pobrać profili.{" "}
          <button
            type="button"
            className="ui-link min-h-11"
            onClick={() => {
              setPending(true);
              setError(false);
              setRetry((old) => old + 1);
            }}
          >
            Spróbuj ponownie
          </button>
        </p>
      )}
    </div>
  );
}

export function RecruitmentWorkspace({
  userId,
  initialQuery,
  initialData,
  invalidQuery = false,
}: {
  userId: string;
  initialQuery: WorkspaceQuery;
  initialData: WorkspaceData | null;
  invalidQuery?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initialData);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialData === null);
  const [retry, setRetry] = useState(0);
  const first = useRef(true);
  const requestId = useRef(0);
  const root = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const columns = useRef<Record<string, HTMLDivElement | null>>({});
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => {
    setSelectedId(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  const change = useCallback((next: WorkspaceQuery) => {
    setQuery(next);
    setSelectedId(null);
    setPending(true);
    setError(false);
    setData(null);
    const params = workspaceSearchParams(next);
    const historyState = { ...window.history.state };
    delete historyState.workspaceReturnToken;
    window.history.replaceState(historyState, "", `/recruitments?${params}`);
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    void readData<WorkspaceData>(
      userId,
      workspaceSearchParams(query),
      controller.signal,
    )
      .then((result) => {
        if (requestId.current === id && !controller.signal.aborted)
          setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted && requestId.current === id)
          setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId.current === id)
          setPending(false);
      });
    return () => controller.abort();
  }, [query, userId, retry]);
  useEffect(() => {
    const { data: subscription } = getBrowserClient().auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || (session && session.user.id !== userId))
          clearWorkspaceNavigation();
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, [userId]);
  useEffect(() => {
    if (!data) return;
    const hash = window.location.hash;
    const token = hash.startsWith("#workspace-return=")
      ? hash.slice(18)
      : window.history.state?.workspaceReturnToken;
    if (typeof token !== "string") return;
    const previous = findWorkspaceNavigation(userId, token);
    if (
      !previous ||
      previous.href !== window.location.pathname + window.location.search
    )
      return;
    let frame = 0;
    const observer = new MutationObserver(restoreWhenVisible);
    function restoreWhenVisible() {
      if (!root.current?.getClientRects().length) return;
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        window.scrollTo(0, previous!.scrollY);
        if (board.current) board.current.scrollLeft = previous!.boardScroll;
        for (const [status, scroll] of Object.entries(previous!.columns)) {
          const column = columns.current[status];
          if (column) column.scrollTop = scroll;
        }
        if (hash)
          window.history.replaceState(window.history.state, "", previous!.href);
      });
    }
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["hidden"],
    });
    restoreWhenVisible();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [data, userId]);
  function select(id: string, element: HTMLButtonElement) {
    trigger.current = element;
    setSelectedId(id);
  }
  function remember(token: string) {
    window.history.replaceState(
      { ...window.history.state, workspaceReturnToken: token },
      "",
    );
    rememberWorkspaceNavigation({
      token,
      userId,
      href: window.location.pathname + window.location.search,
      scrollY: window.scrollY,
      boardScroll: board.current?.scrollLeft ?? 0,
      columns: Object.fromEntries(
        Object.entries(columns.current).map(([key, value]) => [
          key,
          value?.scrollTop ?? 0,
        ]),
      ),
    });
  }
  const preset = workspacePresetName(query);
  const anyCases =
    data &&
    (data.list
      ? data.list.cases.length > 0
      : Object.values(data.columns).some(
          (column) => column && column.cases.length > 0,
        ));
  const filtered =
    query.statuses.length !== 4 ||
    query.organizationId !== null ||
    query.contactId !== null;
  return (
    <>
      <section
        ref={root}
        aria-label="Ustawienia widoku rekrutacji"
        className="ui-panel mb-5 p-4 sm:p-5"
      >
        {invalidQuery && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            Nieprawidłowe parametry widoku. Przywrócono ustawienia domyślne.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Widok spraw"
          >
            {(
              [
                ["kanban", "Kanban"],
                ["list", "Lista"],
              ] as const
            ).map(([view, label]) => (
              <button
                type="button"
                key={view}
                aria-pressed={query.view === view}
                className={
                  query.view === view
                    ? buttonStyles.primary
                    : buttonStyles.secondary
                }
                onClick={() => change({ ...query, view })}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Szybkie widoki"
          >
            {(
              [
                ["all", "Wszystkie"],
                ["active", "Aktywne"],
                ["closed", "Zakończone"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={preset === value}
                className={
                  preset === value ? buttonStyles.secondary : buttonStyles.ghost
                }
                onClick={() => change(workspacePreset(query, value))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Status sprawy</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {statuses.map((status) => (
              <label
                key={status}
                className="inline-flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={query.statuses.includes(status)}
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? statuses.filter(
                          (s) => s === status || query.statuses.includes(s),
                        )
                      : query.statuses.filter((s) => s !== status);
                    change(
                      resetWorkspacePages({ ...query, statuses: selected }),
                    );
                  }}
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
          <ProfileSelect
            userId={userId}
            type="organization"
            value={query.organizationId}
            onChange={(organizationId) =>
              change(resetWorkspacePages({ ...query, organizationId }))
            }
          />
          <ProfileSelect
            userId={userId}
            type="contact"
            value={query.contactId}
            onChange={(contactId) =>
              change(resetWorkspacePages({ ...query, contactId }))
            }
          />
          <label className="block min-w-0 text-sm font-medium">
            Sortowanie
            <select
              value={query.sort}
              className={`${control} mt-2`}
              onChange={(event) =>
                change(
                  resetWorkspacePages({
                    ...query,
                    sort: event.target.value as WorkspaceQuery["sort"],
                  }),
                )
              }
            >
              <option value="newest">Data dodania: od najnowszych</option>
              <option value="oldest">Data dodania: od najstarszych</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonStyles.ghost}
            onClick={() =>
              change({
                ...defaultWorkspaceQuery(),
                view: query.view,
                closedOpen: query.closedOpen,
              })
            }
          >
            Wyczyść filtry
          </button>
          <p className="text-[13px] text-muted-foreground">
            Filtry i sortowanie zmieniają wyłącznie prezentację spraw.
          </p>
        </div>
      </section>
      <div
        role="status"
        aria-live="polite"
        className="mb-3 text-sm text-muted-foreground"
      >
        {pending
          ? "Ładowanie spraw…"
          : data
            ? "Widok spraw zaktualizowany."
            : ""}
      </div>
      {error && (
        <section role="alert" className="ui-panel mb-4 p-5 text-sm">
          <p>Nie udało się pobrać spraw. Dane nie zostały zmienione.</p>
          <button
            className={`${buttonStyles.secondary} mt-3`}
            type="button"
            onClick={() => {
              setPending(true);
              setError(false);
              setData(null);
              setRetry((old) => old + 1);
            }}
          >
            Spróbuj ponownie
          </button>
        </section>
      )}
      {data && !anyCases && (
        <section className="ui-panel mb-4 p-5">
          <h2 className="text-lg font-semibold">
            {filtered
              ? "Brak wyników dla wybranych filtrów"
              : "Brak spraw na tej stronie"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered
              ? "Zmień lub wyczyść filtry, aby zobaczyć inne sprawy."
              : "Jeśli nie masz jeszcze spraw, wybierz „Dodaj”. Możesz też wrócić do poprzedniej strony wyników."}
          </p>
        </section>
      )}
      {data && query.view === "list" && data.list && (
        <section aria-label="Lista rekrutacji" className="ui-panel">
          <ul aria-label="Sprawy rekrutacyjne">
            {data.list.cases.map((item) => (
              <WorkspaceRecord key={item.id} item={item} select={select} />
            ))}
          </ul>
          <PageNavigation
            result={data.list}
            label="Strony listy"
            change={(page) => change({ ...query, page })}
          />
        </section>
      )}
      {data && query.view === "kanban" && (
        <section aria-label="Tablica rekrutacji">
          <p className="mb-3 text-[13px] text-muted-foreground">
            Kolumny przedstawiają statusy. Karty służą do podglądu; zmiany
            sprawy są dostępne na pełnej stronie.
          </p>
          <div
            ref={board}
            className="max-w-full overflow-x-auto pb-3"
            tabIndex={0}
            aria-label="Przewijanie tablicy"
          >
            <div className="grid min-w-[1000px] grid-cols-4 items-start gap-4">
              {statuses.map((status) => {
                const column = data.columns[status];
                const closed = status === "Zakończone" && !query.closedOpen;
                return (
                  <section
                    key={status}
                    className="min-w-0 rounded-lg border border-border bg-card"
                    aria-label={`Kolumna: ${status}`}
                  >
                    <header className="border-b border-border p-4">
                      <h2 className="text-sm font-semibold [overflow-wrap:anywhere]">
                        {status}
                      </h2>
                      {status === "Zakończone" && (
                        <button
                          type="button"
                          aria-expanded={!closed}
                          className="ui-link mt-2 min-h-11 text-sm"
                          onClick={() =>
                            change({ ...query, closedOpen: !query.closedOpen })
                          }
                        >
                          {closed ? "Rozwiń zakończone" : "Zwiń zakończone"}
                        </button>
                      )}
                    </header>
                    {!closed && (
                      <>
                        <div
                          ref={(element) => {
                            columns.current[status] = element;
                          }}
                          className="max-h-[32rem] overflow-y-auto"
                          tabIndex={0}
                          aria-label={`Sprawy: ${status}`}
                        >
                          <ul>
                            {column?.cases.map((item) => (
                              <WorkspaceRecord
                                key={item.id}
                                item={item}
                                select={select}
                              />
                            ))}
                          </ul>
                          {!column?.cases.length && (
                            <p className="p-4 text-sm text-muted-foreground">
                              {query.statuses.includes(status)
                                ? "Brak spraw na tej stronie."
                                : "Status wyłączony w filtrze."}
                            </p>
                          )}
                        </div>
                        {column && (
                          <PageNavigation
                            result={column}
                            label={`Strony: ${status}`}
                            change={(page) =>
                              change({
                                ...query,
                                columnPages: {
                                  ...query.columnPages,
                                  [status]: page,
                                },
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {selectedId && (
        <WorkspaceDrawer
          key={selectedId}
          userId={userId}
          id={selectedId}
          close={close}
          remember={remember}
        />
      )}
    </>
  );
}

function WorkspaceDrawer({
  userId,
  id,
  close,
  remember,
}: {
  userId: string;
  id: string;
  close: () => void;
  remember: (token: string) => void;
}) {
  const [result, setResult] = useState<WorkspacePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mobile, setMobile] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void readData<WorkspacePreview>(
      userId,
      new URLSearchParams({ mode: "preview", id }),
      controller.signal,
    )
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error && reason.message === "missing"
              ? "Ta sprawa jest niedostępna."
              : "Nie udało się pobrać podglądu.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, userId, retry]);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab" && mobile && panel.current) {
        const elements = Array.from(
          panel.current.querySelectorAll<HTMLElement>(focusables),
        ).filter(shown);
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    function focus(event: FocusEvent) {
      const element = event.target;
      if (
        !(element instanceof HTMLElement) ||
        !panel.current ||
        panel.current.contains(element)
      )
        return;
      const rect = element.getBoundingClientRect(),
        overlay = panel.current.getBoundingClientRect();
      if (
        mobile ||
        (rect.right > overlay.left &&
          rect.left < overlay.right &&
          rect.bottom > overlay.top &&
          rect.top < overlay.bottom)
      )
        closeButton.current?.focus({ preventScroll: true });
    }
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", focus);
    };
  }, [mobile, close]);
  const [returnToken] = useState(() => crypto.randomUUID());
  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal={mobile ? true : undefined}
      aria-label="Podgląd sprawy"
      className="fixed inset-y-0 right-0 z-40 flex w-full min-w-0 flex-col border-l border-border bg-card shadow-xl md:w-[min(32rem,50vw)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <h2 className="min-w-0 text-lg font-semibold">Podgląd sprawy</h2>
        <button
          ref={closeButton}
          type="button"
          aria-label="Zamknij podgląd"
          className={buttonStyles.secondary}
          onClick={close}
        >
          {mobile ? "Wstecz" : "Zamknij"}
        </button>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
        aria-live="polite"
      >
        {!result && !error && <p role="status">Ładowanie podglądu…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className={`${buttonStyles.secondary} mt-3`}
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
                setRetry((old) => old + 1);
              }}
            >
              Spróbuj ponownie
            </button>
          </div>
        )}
        {result && (
          <>
            <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">
              {result.case.title}
            </h3>
            <div className="mt-3">
              <CaseStatus status={result.case.status} />
            </div>
            <p className="mt-3 text-sm [overflow-wrap:anywhere]">
              Bieżący etap: {result.case.current_stage ?? "Nie ustawiono etapu"}
            </p>
            <p className="mt-3 text-[13px] text-muted-foreground">
              Dodano do CRM <CaseCreatedTime value={result.case.created_at} />
            </p>
            {result.case.description && (
              <section className="mt-5">
                <h4 className="font-semibold">Opis</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                  {result.case.description}
                </p>
              </section>
            )}
            {result.case.source_url && (
              <a
                href={result.case.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ui-link mt-4 inline-block min-h-11 max-w-full py-2 text-sm [overflow-wrap:anywhere]"
              >
                {result.case.source_url}
                <span className="sr-only"> (otwiera nową kartę)</span>
              </a>
            )}
            <section className="mt-5">
              <h4 className="font-semibold">Firmy i osoby</h4>
              <OrganizationNames item={result.case} />
              {result.contacts.length > 0 && (
                <ul
                  className="mt-2 space-y-1 text-sm"
                  aria-label="Powiązane osoby"
                >
                  {result.contacts.map((contact) => (
                    <li key={contact.id} className="[overflow-wrap:anywhere]">
                      {contact.name}
                    </li>
                  ))}
                </ul>
              )}
              {result.contactsHasMore && (
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Fragment osób — pozostałe na pełnej stronie sprawy.
                </p>
              )}
              {result.case.organizations.length === 0 &&
                result.contacts.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Brak jawnych powiązań.
                  </p>
                )}
            </section>
            <section className="mt-5">
              <h4 className="font-semibold">Podgląd historii</h4>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Fragment osi czasu. Pełna historia i audyt są na stronie sprawy.
              </p>
              {result.history.length === 0 ? (
                <p className="mt-2 text-sm">Brak wpisów historii.</p>
              ) : (
                <ol className="mt-2 divide-y divide-border">
                  {result.history.map((item) => {
                    const entry = item.type === "fact" ? item.fact : item.entry;
                    const label =
                      item.type === "fact"
                        ? {
                            application: "Zarejestrowano aplikowanie",
                            invitation:
                              "Zarejestrowano kwalifikujące zaproszenie",
                            "stage-change": "Zmieniono etap rekrutacji",
                            contact:
                              item.fact.direction === "inbound"
                                ? "Kontakt przychodzący"
                                : "Kontakt wychodzący",
                          }[item.fact.kind]
                        : item.entry.kind === "close"
                          ? "Zakończono sprawę"
                          : "Wznowiono sprawę";
                    return (
                      <li
                        key={`${item.type}:${entry.id}`}
                        className="py-3 text-sm [overflow-wrap:anywhere]"
                      >
                        <p className="font-medium">{label}</p>
                        {item.type === "fact" && item.fact.voided && (
                          <p>Unieważniony wpis — nie wpływa na bieżący stan.</p>
                        )}
                        {item.type === "fact" &&
                          (item.fact.revision ?? 0) > 0 &&
                          !item.fact.voided && (
                            <p>
                              Skorygowano — wcześniejsze wartości w audycie.
                            </p>
                          )}
                        {item.type === "fact" && item.fact.stage_name && (
                          <p>Etap: {item.fact.stage_name}</p>
                        )}
                        {item.type === "lifecycle" && item.entry.outcome && (
                          <p>Wynik: {item.entry.outcome}</p>
                        )}
                        <p className="mt-1 text-muted-foreground">
                          {entry.occurred_on
                            ? `Data zdarzenia: ${entry.occurred_on}`
                            : "Data zdarzenia nieznana"}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              {result.hasMoreHistory && (
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Dalsze wpisy są dostępne na pełnej stronie.
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <footer className="border-t border-border bg-card p-4">
        {result && (
          <Link
            href={`/recruitments/${id}?workspaceReturn=${returnToken}`}
            prefetch={false}
            className={`${buttonStyles.primary} flex w-full justify-center`}
            onClick={() => remember(returnToken)}
          >
            Otwórz pełną stronę
          </Link>
        )}
      </footer>
    </aside>
  );
}
