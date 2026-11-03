// Runs `next dev` against data/demo.db instead of the real database.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_PATH: path.join(process.cwd(), "data", "demo.db") },
});
child.on("exit", (code) => process.exit(code ?? 0));
