import { rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const distDir = resolve(root, "dist");

try {
  await stat(distDir);
} catch {
  throw new Error("A production build is required before preparing the npm package. Run npm run build first.");
}

// These are build-time or development-only artifacts. Removing only these
// generated directories keeps the npm tarball small without affecting next start.
for (const relativePath of ["cache", "dev", "diagnostics", "types", "trace", "trace-build", "turbopack"]) {
  await rm(resolve(distDir, relativePath), { recursive: true, force: true });
}
