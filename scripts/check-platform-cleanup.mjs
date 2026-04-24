import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbidden = [
  /Discord/i,
  /discordsays/i,
  /Cloud Run/i,
  /\bGCP\b/i,
  /\bGCS\b/i,
  /Supabase/i,
  /Firestore/i,
  /Upstash/i,
  /DISCORD_/,
  /GCS_BUCKET/,
  /UPSTASH/,
];

const excludedDirs = new Set([
  ".git",
  ".agents",
  "node_modules",
  "dist",
  "coverage",
  ".vite",
  ".turbo",
  "playwright-report",
  "test-results",
]);

const allowedFiles = new Set([
  "CHANGELOG.md",
  "legacy_changelog.md",
  "legacy_readme.md",
  ".env",
  ".env.production",
  "eslint-errors.json",
  "eslint_output.txt",
  "scripts/check-platform-cleanup.mjs",
]);

const allowedExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".env",
  ".example",
  ".html",
  ".css",
  ".sql",
]);

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function shouldScan(file) {
  const relative = rel(file);
  if (allowedFiles.has(relative)) return false;
  const name = path.basename(file);
  const ext = path.extname(name);
  return allowedExtensions.has(ext) || name.startsWith(".env");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const relative = rel(full);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (!excludedDirs.has(entry)) walk(full, out);
      continue;
    }
    if (stats.isFile() && shouldScan(full)) out.push({ full, relative });
  }
  return out;
}

const findings = [];
for (const file of walk(root)) {
  const lines = readFileSync(file.full, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of forbidden) {
      if (pattern.test(line)) {
        findings.push(`${file.relative}:${index + 1}: ${line.trim()}`);
        break;
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Platform residue found in active files:");
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log("Platform cleanup check passed.");
