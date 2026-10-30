import Link from "next/link";
import { Button } from "@base-ui/react/button";
import { X, CircleCheck } from "lucide-react";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

/** Render inside the active modal when save-next keeps it open. */
export function SavedCaseNotice({
  item,
  onDismiss,
  floating = false,
}: {
  item: RecruitmentCase | null;
  onDismiss: () => void;
  floating?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={
        item
          ? `${floating ? "fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg shadow-lg" : "basis-full"} rounded-lg border border-primary bg-success-surface p-4 text-sm text-success`
          : "sr-only"
      }
    >
      {item && (
        <>
          <p
            id="capture-success-message"
            className="flex items-center gap-2 font-semibold"
          >
            <CircleCheck aria-hidden="true" size={16} />
            Sprawa została zapisana.
          </p>
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
        </>
      )}
    </div>
  );
}
