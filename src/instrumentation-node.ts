import fs from "node:fs";
import path from "node:path";
import { bindError } from "@/lib/auth";

export function ensureDirs() {
  const err = bindError();
  if (err) {
    console.error(`\n${err}\n`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), "logs"), { recursive: true });
}
