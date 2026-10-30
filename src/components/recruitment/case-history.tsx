import Link from "next/link";
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
  return event.direction === "inbound"
    ? "Kontakt przychodzący"
    : "Kontakt wychodzący";
}
function HistoryEntries({ events }: { events: CaseEvent[] }) {
  return (
    <ol className="mt-3 divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="py-4 first:pt-0">
          <p className="text-sm font-semibold">{caseEventLabel(event)}</p>
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
        </li>
      ))}
    </ol>
  );
}
export function CaseHistory({
  caseId,
  result,
}: {
  caseId: string;
  result: { events: CaseEvent[]; page: number; hasMore: boolean } | null;
}) {
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
      <h2 className="text-lg font-semibold" id="case-history-heading">
        Historia sprawy
      </h2>
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
                  <HistoryEntries events={dated} />
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
                  <HistoryEntries events={undated} />
                </div>
              )}
            </>
          )}
          {(result.page > 1 || result.hasMore) && (
            <nav
              aria-label="Strony historii sprawy"
              className="mt-4 flex flex-wrap items-center gap-5 text-sm text-muted-foreground"
            >
              {result.page > 1 && (
                <Link
                  className="ui-link inline-flex min-h-11 items-center"
                  href={`/recruitments/${caseId}?historyPage=${result.page - 1}#history`}
                >
                  Poprzednia strona historii
                </Link>
              )}
              <span>Strona {result.page}</span>
              {result.hasMore && (
                <Link
                  className="ui-link inline-flex min-h-11 items-center"
                  href={`/recruitments/${caseId}?historyPage=${result.page + 1}#history`}
                >
                  Następna strona historii
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
