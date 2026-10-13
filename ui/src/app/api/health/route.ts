// GET /api/health: {status, robots, tutorials, multiSeller}. See src/server/catalog.ts.

import { health } from "@/server/catalog";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(health());
}
