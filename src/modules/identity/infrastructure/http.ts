import type { NextResponse } from "next/server";

export const privateCacheHeaders = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export function protectAuthResponse(response: NextResponse) {
  for (const [name, value] of Object.entries(privateCacheHeaders))
    response.headers.set(name, value);
  return response;
}
