/**
 * Copies the files pdf.js loads at runtime (its web worker, standard fonts,
 * character maps and image decoders) from node_modules into public/pdfjs/, so
 * the song bank's sheet music viewer serves them from the app itself.
 * Runs after `npm install` (postinstall). public/pdfjs/ is git-ignored.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const source = path.resolve("node_modules/pdfjs-dist");
const target = path.resolve("public/pdfjs");

if (!existsSync(source)) {
  console.warn("pdfjs-dist is not installed; skipping the PDF viewer assets.");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(path.join(source, "legacy/build/pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
for (const folder of ["standard_fonts", "cmaps", "wasm"]) {
  cpSync(path.join(source, folder), path.join(target, folder), { recursive: true });
}
console.log("Copied pdf.js assets to public/pdfjs/");
