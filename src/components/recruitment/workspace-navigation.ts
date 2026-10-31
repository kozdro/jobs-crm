import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

/** Ephemeral owner-scoped navigation metadata only. Never stores case/profile data. */
export type WorkspaceNavigation = {
  token: string;
  userId: string;
  href: string;
  scrollY: number;
  boardScroll: number;
  columns: Record<string, number>;
};
export function workspaceResumeToken(params: URLSearchParams): string | null {
  const values = params.getAll("workspaceResume");
  return values.length === 1 && uuidPattern.test(values[0]) ? values[0] : null;
}
let context: WorkspaceNavigation | null = null;
export function rememberWorkspaceNavigation(value: WorkspaceNavigation) {
  context = value;
}
export function findWorkspaceNavigation(userId: string, token?: string | null) {
  if (
    !context ||
    context.userId !== userId ||
    (token && token !== context.token)
  )
    return null;
  return context;
}
export function clearWorkspaceNavigation() {
  context = null;
}
/** A direct detail link cannot manufacture a previous Workspace destination. */
export function workspaceReturnHref(userId: string, token?: string | null) {
  const value =
    token && uuidPattern.test(token)
      ? findWorkspaceNavigation(userId, token)
      : null;
  if (!value) return "/recruitments";
  // Auth deliberately removes URL fragments before initializing the browser SDK.
  // Carry navigation metadata in the query; it has no authorization authority.
  const destination = new URL(value.href, "https://workspace.invalid");
  destination.searchParams.set("workspaceResume", value.token);
  return destination.pathname + destination.search;
}
