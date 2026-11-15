/** Small inherited environment: never propagate ambient credentials into a product process. */
export function baseProcessEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const keys = ["PATH", "HOME", "TMPDIR", "LANG", "CI"];
  return Object.fromEntries(
    keys.flatMap((key) =>
      source[key] === undefined ? [] : [[key, source[key]]],
    ),
  );
}
export function assertBffEnvironment(env: NodeJS.ProcessEnv) {
  for (const key of [
    "DOCUMENTS_VALIDATOR_JWT",
    "DOCUMENTS_CLEANUP_JWT",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AUTH_JWT_SECRET",
  ]) {
    if (env[key] !== undefined)
      throw new Error("BFF environment contains a forbidden credential");
  }
}

export function assertCleanupEnvironment(env: NodeJS.ProcessEnv) {
  for (const key of [
    "DOCUMENTS_VALIDATOR_JWT",
    "DOCUMENTS_UPLOADER_JWT",
    "DOCUMENTS_DELETE_AUTHORIZER_JWT",
    "DOCUMENTS_VALIDATOR_SERVICE_SECRET",
    "DOCUMENTS_PERMIT_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AUTH_JWT_SECRET",
  ]) {
    if (env[key] !== undefined)
      throw new Error("Cleanup environment contains a forbidden credential");
  }
}
