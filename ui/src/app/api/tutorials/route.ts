// GET /api/tutorials: the whole library, unpaginated. See src/server/catalog.ts.

import { getTutorials } from "@/server/catalog";

export const dynamic = "force-dynamic";

export function GET() {
  const tutorials = getTutorials();
  return Response.json({ tutorials, count: tutorials.length });
}
