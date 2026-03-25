/**
 * Fails the build if common UTF-8 mojibake fragments appear in source.
 * Does not flag normal Romanian/other text that uses LATIN SMALL LETTER A WITH CIRCUMFLEX alone.
 *
 * Run: npm run encoding:check
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const EXT = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".css", ".scss"]);

/** Strong signals of prior CP1252 / Latin-1 mis-decode of UTF-8 */
const PATTERNS = [
  // Mojibake fragments as \\u escapes so this file stays ASCII-only.
  { name: "mojibake_emoji_prefix", re: /\u00F0\u0178/g },
  { name: "mojibake_bullet", re: /\u00E2\u20AC[\u00A2\u00AC]/g },
  { name: "mojibake_times", re: /\u00C3\u2014/g },
  { name: "mojibake_suit_or_misc", re: /\u00E2\u2122/g },
  { name: "mojibake_nbsp_combo", re: /\u00C2\s/g },
  { name: "unicode_replacement", re: /\uFFFD/g },
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else {
      const ext = path.extname(e.name);
      if (EXT.has(ext)) out.push(p);
    }
  }
  return out;
}

function main() {
  const files = walk(ROOT);
  const hits = [];

  for (const fp of files) {
    let text;
    try {
      text = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(text)) {
        hits.push({ file: path.relative(ROOT, fp).replace(/\\/g, "/"), pattern: name });
        break;
      }
    }
  }

  if (hits.length) {
    console.error("encoding:check failed - possible mojibake in UTF-8 sources:");
    hits.forEach((h) => console.error(`  ${h.file} (${h.pattern})`));
    process.exit(1);
  }
  console.log("encoding:check OK - no strong mojibake patterns in scanned sources.");
}

main();
