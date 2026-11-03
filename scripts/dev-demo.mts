// Runs `next dev` against the demo database (data/demo-pglite) instead of the real one.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  // ORBIT_DEMO makes the app ignore DATABASE_URL, so the demo never touches the real database.
  env: { ...process.env, ORBIT_DEMO: "1", DATABASE_PATH: path.join(process.cwd(), "data", "demo-pglite") },
});
child.on("exit", (code) => process.exit(code ?? 0));
