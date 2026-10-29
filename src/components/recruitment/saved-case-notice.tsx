import Link from "next/link";
import { Button } from "@base-ui/react/button";
import { X } from "lucide-react";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

/** Render inside the active modal when save-next keeps it open. */
export function SavedCaseNotice({
  item,
  onDismiss,
}: {
  item: RecruitmentCase;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="basis-full rounded-lg border border-border bg-card p-4 text-sm"
    >
      <p>Sprawa została zapisana.</p>
      <Link
        href={`/recruitments/${item.id}`}
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Otwórz sprawę
      </Link>
      <Button
        type="button"
        aria-label="Zamknij powiadomienie"
        onClick={onDismiss}
        className="ml-3 inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden="true" size={16} />
      </Button>
    </div>
  );
}
