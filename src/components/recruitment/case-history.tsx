"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  HistoryAudit,
  HistoryCorrections,
  HistoryRecovery,
} from "./history-corrections";
import { historyIntentStorageKey, parseHistoryIntent } from "./history-intent";
import {
  warsawToday,
  type CaseEvent,
} from "@/modules/recruitment/domain/case-events";
import { CaseCreatedTime } from "./case-content";

export function formatEventDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}
export function caseEventLabel(event: Pick<CaseEvent, "kind" | "direction">) {
  if (event.kind === "application") return "Zarejestrowano aplikowanie";
  if (event.kind === "invitation")
    return "Zarejestrowano kwalifikujące zaproszenie";
  if (event.kind === "stage-change") return "Zmieniono etap rekrutacji";
  return event.direction === "inbound"
    ? "Kontakt przychodzący"
    : "Kontakt wychodzący";
}
type Editing = { id: string; operation: "correct" | "void" } | null;
type EditControls = { active: Editing; select: (event: Editing) => void };
function HistoryEntry({
  event,
  userId,
  caseId,
  active,
  select,
}: { event: CaseEvent; userId?: string; caseId: string } & EditControls) {
  const editing = active?.id === event.id ? active.operation : null;
  const correctionTrigger = useRef<HTMLButtonElement>(null);
  const voidTrigger = useRef<HTMLButtonElement>(null);
  const returnTarget = useRef<"correct" | "void">("correct");
  function close() {
    select(null);
    window.dispatchEvent(
      new CustomEvent("jobs-crm:history-recovery", { detail: { caseId } }),
    );
    requestAnimationFrame(() =>
      (returnTarget.current === "correct"
        ? correctionTrigger
        : voidTrigger
      ).current?.focus(),
    );
  }
  return (
    <li id={`history-entry-${event.id}`} className="py-4 first:pt-0">
      <p className="text-sm font-semibold">{caseEventLabel(event)}</p>
      {event.voided && (
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Unieważniony wpis — nie wpływa na bieżący stan sprawy.
        </p>
      )}
      {(event.revision ?? 0) > 0 && !event.voided && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Skorygowano — wcześniejsze wartości są dostępne w audycie.
        </p>
      )}
      {event.stage_name && (
        <dl className="mt-2 space-y-1 text-sm [overflow-wrap:anywhere]">
          <div>
            <dt className="inline text-muted-foreground">Poprzedni etap: </dt>
            <dd className="inline">
              {event.previous_stage ?? "Nie ustawiono etapu"}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Ustawiony etap: </dt>
            <dd className="inline">{event.stage_name}</dd>
          </div>
        </dl>
      )}
      {event.stage_name && userId && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Poprzedni etap to oryginalny zapis z chwili rejestracji. Późniejsze
          korekty i unieważnienia nie zmieniają tego pierwotnego zapisu.
        </p>
      )}
      {event.occurred_on && (
        <p className="mt-1 text-sm text-muted-foreground">
          Data zdarzenia:{" "}
          <time dateTime={event.occurred_on}>
            {formatEventDay(event.occurred_on)}
          </time>
        </p>
      )}
      {event.occurred_on &&
        event.occurred_on < warsawToday(new Date(event.recorded_at)) && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            Dodano po dacie zdarzenia.
          </p>
        )}
      <details className="mt-1">
        <summary className="ui-link min-h-11 cursor-pointer py-3 text-[13px]">
          Szczegóły rejestracji
        </summary>
        <p className="text-[13px] text-muted-foreground">
          Dodano do CRM: <CaseCreatedTime value={event.recorded_at} />
        </p>
      </details>
      {userId && (
        <>
          {!event.voided && !editing && (
            <div className="mt-2 flex flex-wrap gap-4">
              <button
                ref={correctionTrigger}
                type="button"
                disabled={Boolean(active)}
                className="ui-link min-h-11 py-2 text-sm"
                onClick={() => {
                  returnTarget.current = "correct";
                  select({ id: event.id, operation: "correct" });
                }}
              >
                Skoryguj wpis
              </button>
              <button
                ref={voidTrigger}
                type="button"
                disabled={Boolean(active)}
                className="ui-link min-h-11 py-2 text-sm"
                onClick={() => {
                  returnTarget.current = "void";
                  select({ id: event.id, operation: "void" });
                }}
              >
                Unieważnij wpis
              </button>
            </div>
          )}
          {editing && (
            <HistoryCorrections
              key={`${userId}:${event.id}:${editing}`}
              userId={userId}
              caseId={caseId}
              event={event}
              initialOperation={editing}
              onClose={close}
            />
          )}
          <HistoryAudit
            key={`${userId}:${event.id}:${event.revision}`}
            userId={userId}
            caseId={caseId}
            eventId={event.id}
          />
        </>
      )}
    </li>
  );
}
function HistoryEntries({
  events,
  userId,
  caseId,
  active,
  select,
}: { events: CaseEvent[]; userId?: string; caseId: string } & EditControls) {
  return (
    <ol className="mt-3 divide-y divide-border">
      {events.map((event) => (
        <HistoryEntry
          key={`${userId}:${event.id}`}
          event={event}
          userId={userId}
          caseId={caseId}
          active={active}
          select={select}
        />
      ))}
    </ol>
  );
}
export function CaseHistory({
  caseId,
  result,
  userId,
}: {
  caseId: string;
  userId?: string;
  result: { events: CaseEvent[]; page: number; hasMore: boolean } | null;
}) {
  const [active, setActive] = useState<Editing>(null);
  const [locked, setLocked] = useState(false);
  function select(value: Editing) {
    if (value && userId) {
      try {
        if (
          parseHistoryIntent(
            sessionStorage.getItem(`${historyIntentStorageKey}.${caseId}`),
            userId,
            caseId,
          )
        ) {
          setLocked(true);
          return;
        }
      } catch {
        /* An in-memory editor still allows safe retry. */
      }
    }
    setLocked(false);
    setActive(value);
  }
  const dated =
    result?.events.filter((event) => event.occurred_on !== null) ?? [];
  const undated =
    result?.events.filter((event) => event.occurred_on === null) ?? [];
  return (
    <section
      className="ui-panel mt-5 min-w-0 p-5 sm:p-6"
      aria-labelledby="case-history-heading"
      id="history"
    >
      <h2
        className="text-lg font-semibold outline-none"
        id="case-history-heading"
        tabIndex={-1}
      >
        Historia sprawy
      </h2>
      {userId && (
        <HistoryRecovery
          key={`${userId}:${caseId}`}
          userId={userId}
          caseId={caseId}
        />
      )}
      {locked && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Najpierw sprawdź wynik poprzedniej korekty. Nie rozpoczęto nowej
          zmiany.
        </p>
      )}
      {!result ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Nie udało się pobrać historii. Odśwież stronę i spróbuj ponownie.
        </p>
      ) : (
        <>
          {result.events.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {result.page === 1
                ? "Nie zarejestrowano jeszcze zdarzeń biznesowych. Samo zapisanie sprawy nie oznacza aplikowania ani kontaktu."
                : "Brak zdarzeń na tej stronie historii."}
            </p>
          ) : (
            <>
              {dated.length > 0 && (
                <div className="mt-5">
                  <HistoryEntries
                    events={dated}
                    userId={userId}
                    caseId={caseId}
                    active={active}
                    select={select}
                  />
                </div>
              )}
              {undated.length > 0 && (
                <div className="mt-5 border-t border-border pt-5">
                  <h3 className="text-sm font-semibold">
                    Data zdarzenia nieznana
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    Te wpisy nie są przypisane do dnia zdarzenia. Czas dodania
                    do CRM jest dostępny w szczegółach.
                  </p>
                  <HistoryEntries
                    events={undated}
                    userId={userId}
                    caseId={caseId}
                    active={active}
                    select={select}
                  />
                </div>
              )}
            </>
          )}
          {(result.page > 1 || result.hasMore) && (
            <nav
              aria-label="Strony historii sprawy"
              className="mt-4 flex flex-wrap items-center gap-5 text-sm text-muted-foreground"
            >
              {active && (
                <p className="basis-full text-sm">
                  Zakończ lub anuluj otwartą korektę przed zmianą strony
                  historii. Dane formularza pozostają zachowane.
                </p>
              )}
              {result.page > 1 &&
                (active ? (
                  <span aria-disabled="true">Poprzednia strona historii</span>
                ) : (
                  <Link
                    className="ui-link inline-flex min-h-11 items-center"
                    href={`/recruitments/${caseId}?historyPage=${result.page - 1}#history`}
                  >
                    Poprzednia strona historii
                  </Link>
                ))}
              <span>Strona {result.page}</span>
              {result.hasMore &&
                (active ? (
                  <span aria-disabled="true">Następna strona historii</span>
                ) : (
                  <Link
                    className="ui-link inline-flex min-h-11 items-center"
                    href={`/recruitments/${caseId}?historyPage=${result.page + 1}#history`}
                  >
                    Następna strona historii
                  </Link>
                ))}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
