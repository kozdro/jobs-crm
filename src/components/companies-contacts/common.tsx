"use client";
import Link from "next/link";
import { useState } from "react";
import type { CatalogAudit } from "@/modules/companies-contacts/domain/catalog";
import { buttonStyles } from "@/components/ui/styles";
import { profileHref } from "./client";
import { useCatalogRead, type CatalogMutation } from "./hooks";

export function PageControls({
  page,
  hasMore,
  onPage,
  label,
  disabled = false,
}: {
  page: number;
  hasMore: boolean;
  onPage: (page: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center gap-3 text-sm"
    >
      <button
        type="button"
        disabled={disabled || page === 1}
        className={buttonStyles.secondary}
        onClick={() => onPage(page - 1)}
      >
        Poprzednia strona
      </button>
      <span aria-live="polite">Strona {page}</span>
      <button
        type="button"
        disabled={disabled || !hasMore}
        className={buttonStyles.secondary}
        onClick={() => onPage(page + 1)}
      >
        Następna strona
      </button>
    </nav>
  );
}
export function ReadFeedback({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: boolean;
  reload: () => void;
}) {
  return loading ? (
    <p role="status" className="py-3 text-sm text-muted-foreground">
      Wczytywanie…
    </p>
  ) : error ? (
    <div role="alert" className="space-y-3 py-3 text-sm">
      <p>Nie udało się pobrać danych. To nie oznacza pustej listy.</p>
      <button type="button" className={buttonStyles.secondary} onClick={reload}>
        Ponów odczyt
      </button>
    </div>
  ) : null;
}
export function MutationFeedback({ mutation }: { mutation: CatalogMutation }) {
  const [discard, setDiscard] = useState(false);
  const {
    feedbackRef,
    error,
    saved,
    duplicates,
    pending,
    acknowledge,
    uncertain,
    recover,
    retry,
    reset,
  } = mutation;
  return (
    <div
      ref={feedbackRef}
      tabIndex={-1}
      className="space-y-3 outline-none focus:ring-2 focus:ring-ring"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive-surface p-3 text-sm leading-6 text-destructive"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-md bg-success-surface p-3 text-sm text-success"
        >
          Zapisano zmianę.
        </p>
      )}
      {duplicates && (
        <section
          aria-label="Możliwe duplikaty"
          className="space-y-3 rounded-md border border-warning bg-warning-surface p-4 text-sm"
        >
          <h3 className="font-semibold">Możliwe duplikaty</h3>
          <p>
            Sprawdź istniejące profile. Możesz otworzyć profil i wykorzystać go
            przez jawne powiązanie albo świadomie zapisać odrębny. Niczego nie
            scalamy.
          </p>
          <ul className="space-y-2">
            {duplicates.matches.map((profile) => (
              <li key={profile.id}>
                <Link
                  className="ui-link inline-flex min-h-11 items-center break-all"
                  href={profileHref(profile)}
                >
                  Otwórz profil: {profile.name}
                </Link>
                {profile.email && <p className="break-all">{profile.email}</p>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={pending}
            onClick={acknowledge}
          >
            Zapisz jako odrębny profil
          </button>
        </section>
      )}
      {uncertain && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={pending}
              onClick={() => void recover()}
            >
              Sprawdź wynik zapisu
            </button>
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={pending}
              onClick={retry}
            >
              Ponów ten sam zapis
            </button>
            <button
              type="button"
              className={buttonStyles.ghost}
              disabled={pending}
              onClick={() => setDiscard(true)}
            >
              Porzuć zamiar
            </button>
          </div>
          {discard && (
            <div
              role="group"
              aria-label="Potwierdzenie porzucenia zamiaru"
              className="space-y-3 rounded-md border border-warning p-3 text-sm"
            >
              <p>
                Porzucenie nie cofa operacji. Mogła już zostać zapisana. Sprawdź
                dane przed utworzeniem nowego zamiaru. Po opuszczeniu strony
                dane formularza nie są zachowywane.
              </p>
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={pending}
                onClick={() => {
                  reset();
                  setDiscard(false);
                }}
              >
                Potwierdź porzucenie
              </button>
              <button
                type="button"
                className={buttonStyles.ghost}
                onClick={() => setDiscard(false)}
              >
                Wróć do sprawdzania
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const operationLabels: Record<string, string> = {
  "create-profile": "Utworzenie profilu",
  "edit-profile": "Korekta profilu",
  attach: "Dodanie powiązania",
  detach: "Odłączenie powiązania",
  "change-role": "Korekta roli",
};
export function AuditPanel({
  userId,
  targetId,
  revision = 0,
}: {
  userId: string;
  targetId: string;
  revision?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="ui-panel p-5">
      <button
        type="button"
        aria-expanded={open}
        className={buttonStyles.secondary}
        onClick={() => setOpen((value) => !value)}
      >
        Audyt zmian
      </button>
      {open && (
        <AuditEntries userId={userId} targetId={targetId} revision={revision} />
      )}
    </section>
  );
}
function AuditEntries({
  userId,
  targetId,
  revision,
}: {
  userId: string;
  targetId: string;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  const read = useCatalogRead<{
    audit: CatalogAudit[];
    page: number;
    hasMore: boolean;
  }>(userId, { auditId: targetId, page }, revision);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Prywatny audyt technicznych zmian. To nie jest historia aktywności
        rekrutacyjnej.
      </p>
      <button
        type="button"
        className={buttonStyles.ghost}
        disabled={read.loading}
        onClick={read.reload}
      >
        Odśwież audyt
      </button>
      <ReadFeedback {...read} />
      {read.data && (
        <>
          <ul className="space-y-3" aria-label="Wpisy audytu">
            {read.data.audit.map((entry) => (
              <li
                key={entry.id}
                className="min-w-0 rounded-md border border-border p-3 text-sm"
              >
                <p className="font-medium">
                  {operationLabels[entry.operation] ?? "Zmiana katalogu"}
                </p>
                <p>Użytkownik: właściciel tej przestrzeni</p>
                <time dateTime={entry.recorded_at}>
                  {new Intl.DateTimeFormat("pl-PL", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Warsaw",
                  }).format(new Date(entry.recorded_at))}
                </time>
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer py-2">
                    Dane przed i po zmianie
                  </summary>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="font-medium">Przed</p>
                      <pre className="whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(entry.before_values, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="font-medium">Po</p>
                      <pre className="whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(entry.after_values, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {read.data.audit.length === 0 && (
            <p className="text-sm">Brak wpisów na tej stronie audytu.</p>
          )}
          <PageControls
            label="Strony audytu"
            page={page}
            hasMore={read.data.hasMore}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
