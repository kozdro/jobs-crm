"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { workspaceReturnHref } from "./workspace-navigation";
const subscribe = () => () => {};
export function WorkspaceReturnLink({
  userId,
  token,
}: {
  userId: string;
  token?: string;
}) {
  const href = useSyncExternalStore(
    subscribe,
    () => workspaceReturnHref(userId, token),
    () => "/recruitments",
  );
  return (
    <Link
      href={href}
      scroll={false}
      className="ui-link mb-5 inline-flex min-h-11 items-center text-sm"
    >
      Wróć do listy spraw
    </Link>
  );
}
