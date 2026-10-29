/** Read-only runtime evidence; caller has already verified owned container IDs and loopback. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function serviceVersions(
  projectId: string,
  apiUrl: string,
  anonKey: string,
) {
  if (
    !/^jobs-crm-f2-[a-z][a-z0-9-]*-[a-f0-9]{12}$/.test(projectId) ||
    apiUrl !== "http://127.0.0.1:56421"
  )
    throw new Error("Version probe target refused");
  let restOutput: string;
  try {
    restOutput = (
      await exec(
        "docker",
        ["exec", `supabase_rest_${projectId}`, "postgrest", "--version"],
        { timeout: 15000 },
      )
    ).stdout;
  } catch {
    throw new Error("Unable to read PostgREST runtime version");
  }
  const rest = restOutput.trim();
  if (!/^PostgREST v?\d+\.\d+(?:\.\d+)?(?:[\w .()+-]*)$/.test(rest))
    throw new Error("Unexpected PostgREST version response");
  const response = await fetch(`${apiUrl}/auth/v1/health`, {
    headers: { apikey: anonKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Unable to read Auth runtime version");
  const auth = (await response.json()) as { version?: unknown };
  if (
    typeof auth.version !== "string" ||
    !/^v?\d+\.\d+\.\d+(?:[\w.+-]*)$/.test(auth.version)
  )
    throw new Error("Unexpected Auth version response");
  return { postgrest: rest, auth: auth.version };
}
