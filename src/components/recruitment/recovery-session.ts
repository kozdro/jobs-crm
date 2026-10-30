import {
  isAuthSessionMissingError,
  type AuthError,
} from "@supabase/supabase-js";

/** Missing local SDK sessions use status 400; network/provider outages are retryable. */
export function recoveryRequiresLogin(error: AuthError) {
  return (
    isAuthSessionMissingError(error) || [401, 403].includes(error.status ?? 0)
  );
}
