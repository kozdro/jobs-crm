"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import type {
  CatalogProfile,
  ProfileType,
} from "@/modules/companies-contacts/domain/catalog";
import { parseCatalogCommand } from "@/modules/companies-contacts/domain/catalog";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { useCatalogMutation } from "./hooks";
import { MutationFeedback } from "./common";

export function ProfileForm({
  userId,
  type,
  profile,
  onSaved,
  onCancel,
  onReload,
}: {
  userId: string;
  type: ProfileType;
  profile?: CatalogProfile;
  onSaved: (profile: CatalogProfile) => void;
  onCancel?: () => void;
  onReload?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const feedback = useRef<HTMLParagraphElement>(null);
  const mutation = useCatalogMutation(userId, (result) => {
    if (result.profile) onSaved(result.profile);
  });
  const locked = mutation.pending || mutation.uncertain;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const next: typeof errors = {};
    const count = Array.from(name.trim()).length;
    if (count < 1 || count > 160)
      next.name =
        "Podaj nazwę od 1 do 160 znaków po usunięciu skrajnych odstępów.";
    if (
      type === "contact" &&
      email.trim() &&
      (Array.from(email.trim()).length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()))
    )
      next.email =
        "Podaj jeden poprawny adres e-mail, do 254 znaków, albo pozostaw puste pole.";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    const command = parseCatalogCommand({
      requestId: crypto.randomUUID(),
      operation: profile ? "edit-profile" : "create-profile",
      profileType: type,
      name,
      email: type === "contact" ? email : null,
      ...(profile
        ? { profileId: profile.id, expectedRevision: profile.revision }
        : {}),
    });
    if (command) void mutation.send(command);
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      aria-label={profile ? "Edycja profilu" : "Nowy profil"}
      aria-busy={mutation.pending}
    >
      <div className="space-y-2">
        <label htmlFor={`${id}-name`} className="block text-sm font-medium">
          {type === "organization" ? "Nazwa firmy" : "Nazwa kontaktu"}
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            mutation.clearDraftFeedback();
            setErrors({});
          }}
          disabled={locked}
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={`${id}-count${errors.name ? ` ${id}-name-error` : ""}`}
          className={inputStyles}
        />
        <p id={`${id}-count`} className="text-xs text-muted-foreground">
          {Array.from(name.trim()).length}/160 znaków po usunięciu skrajnych
          odstępów
        </p>
        {errors.name && (
          <p id={`${id}-name-error`} className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>
      {type === "contact" && (
        <div className="space-y-2">
          <label htmlFor={`${id}-email`} className="block text-sm font-medium">
            E-mail (opcjonalnie)
          </label>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              mutation.clearDraftFeedback();
              setErrors({});
            }}
            disabled={locked}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
            className={inputStyles}
          />
          {errors.email && (
            <p id={`${id}-email-error`} className="text-sm text-destructive">
              {errors.email}
            </p>
          )}
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <p
          ref={feedback}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive outline-none focus:ring-2 focus:ring-ring"
        >
          Sprawdź oznaczone pola formularza.
        </p>
      )}
      <MutationFeedback mutation={mutation} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={locked || Boolean(mutation.duplicates)}
          className={buttonStyles.primary}
        >
          {mutation.pending
            ? "Zapisywanie…"
            : profile
              ? "Zapisz zmiany"
              : "Zapisz profil"}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={locked}
            className={buttonStyles.secondary}
            onClick={onCancel}
          >
            Anuluj
          </button>
        )}
      </div>
      {onReload && (
        <button
          type="button"
          disabled={locked}
          className={buttonStyles.ghost}
          onClick={onReload}
        >
          Odśwież dane profilu
        </button>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Dane formularza pozostają w pamięci tej strony. Opuszczenie jej nie
        zachowuje szkicu i nie cofa ewentualnego zapisu.
      </p>
    </form>
  );
}
