import { normalizeAppOrigin } from "./origin";

export interface AuthConfig {
  enabled: boolean;
  url: string;
  key: string;
  origin: string;
  googleEnabled: boolean;
  localFixture: boolean;
}

/** Only publishable configuration may cross this boundary; never pass a service key. */
export function parseAuthConfig(
  input: Record<string, string | undefined>,
): AuthConfig {
  const disabled: AuthConfig = {
    enabled: false,
    url: "",
    key: "",
    origin: "",
    googleEnabled: false,
    localFixture: false,
  };
  if (input.NEXT_PUBLIC_AUTH_ENABLED !== "true") return disabled;
  try {
    const origin = normalizeAppOrigin(input.NEXT_PUBLIC_APP_ORIGIN ?? "");
    const url = normalizeAppOrigin(input.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const key = input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    const legacy = key.split(".");
    const publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    let anon = false;
    if (legacy.length === 3) {
      try {
        anon =
          JSON.parse(atob(legacy[1].replaceAll("-", "+").replaceAll("_", "/")))
            .role === "anon";
      } catch {
        /* Not a supported public key. */
      }
    }
    if (!publishable && !anon) throw new Error();
    const localFixture = input.NEXT_PUBLIC_AUTH_LOCAL_TEST === "true";
    if (
      localFixture &&
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
    )
      throw new Error();
    return {
      enabled: true,
      url,
      key,
      origin,
      googleEnabled: input.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
      localFixture,
    };
  } catch {
    throw new Error("Invalid public Auth configuration");
  }
}
