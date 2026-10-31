/** Ephemeral owner-scoped navigation metadata only. Never stores case/profile data. */
export type WorkspaceNavigation = {
  token: string;
  userId: string;
  href: string;
  scrollY: number;
  boardScroll: number;
  columns: Record<string, number>;
};
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
  const value = token ? findWorkspaceNavigation(userId, token) : null;
  return value
    ? `${value.href}#workspace-return=${value.token}`
    : "/recruitments";
}
