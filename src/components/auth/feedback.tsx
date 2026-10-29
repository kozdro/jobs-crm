import type { Ref } from "react";

export function Feedback({
  message,
  error,
  ref,
}: {
  message: string;
  error: boolean;
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      className={`rounded-md border p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring ${error ? "border-foreground text-foreground" : "border-border text-foreground"}`}
    >
      {message}
    </p>
  );
}
