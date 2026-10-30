/** Minimal create/read domain. Technical creation time is not a business event. */
export const recruitmentStatuses = [
  "Zapisane",
  "Kontakt rozpoczęty",
  "W rekrutacji",
  "Zakończone",
] as const;

export type RecruitmentCase = {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  status: "Zapisane";
  created_at: string;
};

export type CreateCaseInput = {
  requestId: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  allowDuplicate: boolean;
};
export type CreateCaseResult =
  | { kind: "created" | "replayed"; case: RecruitmentCase }
  | { kind: "duplicates"; matches: RecruitmentCase[]; hasMore: boolean };
export type CaseInputErrors = Partial<
  Record<keyof CreateCaseInput | "form", string>
>;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgreSQL text cannot represent NUL or an unpaired UTF-16 surrogate. */
function storableText(value: string) {
  return !value.includes("\0") && value.isWellFormed();
}
export function unicodeLength(value: string) {
  return Array.from(value).length;
}

export function parseCreateCaseInput(
  value: unknown,
):
  | { success: true; data: CreateCaseInput }
  | { success: false; errors: CaseInputErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane formularza." } };
  const input = value as Record<string, unknown>;
  const errors: CaseInputErrors = {};
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "requestId",
          "title",
          "description",
          "sourceUrl",
          "allowDuplicate",
        ].includes(key),
    )
  )
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  if (!uuidPattern.test(requestId))
    errors.requestId = "Nieprawidłowy identyfikator zapisu.";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || unicodeLength(title) > 160 || !storableText(title))
    errors.title = "Podaj nazwę sprawy od 1 do 160 znaków.";
  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string")
      errors.description = "Opis musi być tekstem.";
    else {
      description = input.description.trim() || null;
      if (
        description &&
        (unicodeLength(description) > 2000 || !storableText(description))
      )
        errors.description = "Opis może mieć najwyżej 2000 znaków.";
    }
  }
  let sourceUrl: string | null = null;
  if (input.sourceUrl !== undefined && input.sourceUrl !== null) {
    if (typeof input.sourceUrl !== "string")
      errors.sourceUrl = "Podaj poprawny pełny adres HTTP lub HTTPS.";
    else if (input.sourceUrl.trim()) {
      try {
        const raw = input.sourceUrl.trim();
        if (
          !storableText(raw) ||
          !/^https?:\/\//i.test(raw) ||
          /[\u0000-\u001f\u007f\\]/.test(raw)
        )
          throw new Error("Invalid URL text");
        const url = new URL(raw);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
          throw new Error("Invalid protocol");
        sourceUrl = url.href;
      } catch {
        errors.sourceUrl = "Podaj poprawny pełny adres HTTP lub HTTPS.";
      }
    }
  }
  if (
    input.allowDuplicate !== undefined &&
    typeof input.allowDuplicate !== "boolean"
  )
    errors.allowDuplicate = "Potwierdź decyzję o utworzeniu osobnej sprawy.";
  if (Object.keys(errors).length) return { success: false, errors };
  return {
    success: true,
    data: {
      requestId,
      title,
      description,
      sourceUrl,
      allowDuplicate: input.allowDuplicate === true,
    },
  };
}
