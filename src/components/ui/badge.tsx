"use client";

// Adapted from https://ui.shadcn.com/r/styles/base-nova/badge.json (MIT; see LICENSE).
// Only the used neutral variant is retained.
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "@/lib/utils";

function Badge({
  className,
  render,
  ...props
}: useRender.ComponentProps<"span">) {
  return useRender({
    defaultTagName: "span",
    render,
    props: mergeProps<"span">(
      {
        className: cn(
          "inline-flex w-fit items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        ),
      },
      props,
    ),
    state: { slot: "badge" },
  });
}

export { Badge };
