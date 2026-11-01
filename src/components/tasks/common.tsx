"use client";
import { buttonStyles } from "./styles";
import type { TaskMutation } from "./hooks";
export function TaskReadFeedback({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: boolean;
  reload: () => void;
}) {
  if (loading)
    return (
      <p role="status" className="py-3 text-sm text-muted-foreground">
        Wczytywanie zadań…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-3 py-3 text-sm">
        <p>Nie udało się pobrać danych. To nie oznacza pustej listy.</p>
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={reload}
        >
          Ponów odczyt
        </button>
      </div>
    );
  return null;
}
export function TaskMutationFeedback({
  mutation,
  onReload,
}: {
  mutation: TaskMutation;
  onReload?: () => void;
}) {
  const { feedbackRef, error, stale, uncertain, pending, recover, retry } =
    mutation;
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
      {stale && onReload && (
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={onReload}
        >
          Odśwież dane zadania
        </button>
      )}
      {uncertain && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            className={buttonStyles.secondary}
            onClick={() => void recover()}
          >
            Sprawdź wynik zapisu
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonStyles.secondary}
            onClick={retry}
          >
            Ponów ten sam zapis
          </button>
          <p className="w-full text-sm leading-6 text-muted-foreground">
            Nie zamykaj strony przed ustaleniem wyniku. Ponowienie zachowuje
            identyczne dane i klucz zapisu.
          </p>
        </div>
      )}
    </div>
  );
}
