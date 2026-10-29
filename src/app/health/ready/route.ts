import { getServerEnv } from "@/shared/server/env";

export function GET() {
  getServerEnv();
  return Response.json({ status: "ready" });
}
