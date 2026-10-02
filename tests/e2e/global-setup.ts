import { execSync } from "node:child_process";

export default function globalSetup(): void {
  execSync("npx tsx tests/e2e/setup-db.ts", { stdio: "inherit" });
}
