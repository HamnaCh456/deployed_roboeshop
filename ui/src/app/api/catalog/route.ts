// GET /api/catalog: paginated browse plus facet counts. See src/server/catalog.ts.

import { buildCatalog } from "@/server/catalog";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return Response.json(buildCatalog(new URL(request.url).searchParams));
}
