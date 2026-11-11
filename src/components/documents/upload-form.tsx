"use client";

import { useState, type FormEvent } from "react";
import { buttonStyles, inputStyles } from "@/components/ui/styles";

export type DocumentUploadDraft = {
  file: File;
  name: string;
  isCv: boolean;
  label: string;
};

export function validateUploadDraft(input: {
  file: Pick<File, "name" | "size"> | null;
  name: string;
  label: string;
  versionOnly?: boolean;
}): string | null {
  const nameLength = Array.from(input.name.trim()).length;
  if (!input.file) return "Wybierz plik.";
  if (!input.versionOnly && (!nameLength || nameLength > 160))
    return "Nazwa dokumentu musi mieć od 1 do 160 znaków.";
  if (Array.from(input.label.trim()).length > 160)
    return "Etykieta wersji może mieć najwyżej 160 znaków.";
  if (input.file.size === 0) return "Plik jest pusty.";
  if (input.file.size > 20 * 1024 * 1024)
    return "Plik przekracza limit 20 MiB.";
  if (!/\.(pdf|doc|docx|txt|jpe?g|png)$/i.test(input.file.name))
    return "Wybierz plik PDF, DOC, DOCX, TXT, JPEG lub PNG.";
  return null;
}

/** Client-side checks provide feedback only; the server must validate actual bytes and quota. */
export function DocumentUploadForm({
  onSubmit,
  pending = false,
  blocked = false,
  versionOnly = false,
}: {
  onSubmit: (draft: DocumentUploadDraft) => void | Promise<void>;
  pending?: boolean;
  blocked?: boolean;
  versionOnly?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [isCv, setIsCv] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateUploadDraft({ file, name, label, versionOnly });
    setError(problem);
    if (problem || !file) return;
    void onSubmit({ file, name: name.trim(), isCv, label: label.trim() });
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4"
      aria-busy={pending}
      noValidate
    >
      <p className="text-sm text-muted-foreground">
        PDF, DOC, DOCX, TXT, JPEG lub PNG, do 20 MiB na plik. Limit konta wynosi
        1 GiB. Plik zostanie zweryfikowany po przesłaniu.
      </p>
      <div>
        <label htmlFor="document-file" className="block text-sm font-medium">
          Plik
        </label>
        <input
          id="document-file"
          type="file"
          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          disabled={pending}
          className="mt-2 block max-w-full text-sm"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && !name.trim())
              setName(next.name.replace(/\.[^.]+$/, ""));
          }}
        />
      </div>
      {!versionOnly && (
        <>
          <div>
            <label
              htmlFor="document-name"
              className="block text-sm font-medium"
            >
              Nazwa dokumentu
            </label>
            <input
              id="document-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              className={`${inputStyles} mt-2`}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={isCv}
              onChange={(event) => setIsCv(event.target.checked)}
              disabled={pending}
              className="size-4 accent-primary"
            />{" "}
            To jest CV
          </label>
        </>
      )}
      <div>
        <label htmlFor="document-label" className="block text-sm font-medium">
          Etykieta wersji (opcjonalnie)
        </label>
        <input
          id="document-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={pending}
          className={`${inputStyles} mt-2`}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || blocked}
        className={buttonStyles.primary}
      >
        {pending ? "Przesyłanie…" : "Dodaj plik"}
      </button>
    </form>
  );
}
