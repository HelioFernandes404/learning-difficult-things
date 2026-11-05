// Starts the production server: HOST (default 127.0.0.1) and PORT (default 3000). Works on any OS.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3000";
const exposed = (process.env.HOST && !/^(127\.|localhost$|::1$|\[::1\]$)/.test(host)) || !!process.env.ALLOWED_HOSTS?.trim();
if (exposed && !process.env.APP_PASSWORD && process.env.ALLOW_INSECURE_BIND !== "1") {
  console.error("\nERROR: the server is configured to accept connections from outside this computer (HOST other than 127.0.0.1, or ALLOWED_HOSTS set), but APP_PASSWORD is empty.\nSet APP_PASSWORD to a strong password (see 'Hosting' in the README) or use HOST=127.0.0.1.\n");
  process.exit(1);
}
const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], { stdio: "inherit", env: process.env });
child.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
