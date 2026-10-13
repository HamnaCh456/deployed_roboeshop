// `npm start`: the mock server and `next dev`, together.
//
// next.config.ts forwards /api/catalog, /api/tutorials and /api/health to the
// mock server. Started on its own, `next dev` serves every page, and every
// catalogue request fails with "Could not reach the catalogue server" because
// nothing is listening on 8009. This starts the mock server first unless one is
// already answering, so a second terminal still works, and stops it with Next.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mockDir = path.join(here, "..", "..", "mock-server");
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

// The same default next.config.ts uses; ui/.env is not loaded yet at this point.
const catalogUrl = process.env.CATALOG_API_URL || "http://localhost:8009";

async function catalogueIsUp() {
  try {
    const res = await fetch(`${catalogUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

const children = [];

if (await catalogueIsUp()) {
  console.log(`Catalogue already answering at ${catalogUrl}; not starting another.`);
} else {
  children.push(spawn(process.execPath, ["server.js"], { cwd: mockDir, stdio: "inherit" }));
}

const next = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: path.join(here, ".."),
  stdio: "inherit",
});
children.push(next);

function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill();
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
next.on("exit", (code) => {
  stopAll();
  process.exit(code ?? 0);
});
