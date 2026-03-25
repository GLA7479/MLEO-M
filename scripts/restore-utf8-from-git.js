/**
 * Restores corrupted Unicode in game/arcade/*.js by matching each broken line's
 * ASCII-only fingerprint to the same logical line in git HEAD (pre-corruption).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const FILES = [
  ["game/arcade/challenge-21.js", "game/mleo-blackjack.js"],
  ["game/arcade/card-arena.js", "game/mleo-poker.js"],
  ["game/arcade/color-wheel.js", "game/mleo-roulette.js"],
  ["game/arcade/card-duel.js", "game/mleo-baccarat.js"],
  ["game/arcade/dice-arena.js", "game/mleo-craps.js"],
  ["game/arcade/triple-dice.js", "game/mleo-sicbo.js"],
  ["game/arcade/symbol-match.js", "game/mleo-slots-upgraded.js"],
  ["game/arcade/triple-cards.js", "game/mleo-three-card-poker.js"],
  ["game/arcade/ultimate-cards.js", "game/mleo-ultimate-poker.js"],
];

function needsFix(line) {
  return /[^\x00-\x7F]/.test(line) && /[\u00E2\u00F0\u00C3\u00C2\uFFFD]/.test(line);
}

function asciiFingerprint(line) {
  return line
    .split("")
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n >= 32 && n <= 126;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function gitShow(relPath) {
  return execSync(`git show HEAD:${relPath}`, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
}

function buildIndex(oldLines) {
  /** @type {Map<string, number[]>} */
  const m = new Map();
  oldLines.forEach((line, idx) => {
    const fp = asciiFingerprint(line);
    if (!fp) return;
    if (!m.has(fp)) m.set(fp, []);
    m.get(fp).push(idx);
  });
  return m;
}

function mergeFile(newPath, oldGitPath) {
  let oldStr;
  try {
    oldStr = gitShow(oldGitPath);
  } catch (e) {
    console.error("skip", newPath, e.message);
    return;
  }

  const newStr = fs.readFileSync(path.join(ROOT, newPath), "utf8");
  const newLines = newStr.split(/\r?\n/);
  const oldLines = oldStr.split(/\r?\n/);
  const index = buildIndex(oldLines);

  let replaced = 0;
  let missed = 0;

  for (let ni = 0; ni < newLines.length; ni++) {
    const line = newLines[ni];
    if (!needsFix(line)) continue;

    const fp = asciiFingerprint(line);
    const hits = index.get(fp);
    if (!hits || hits.length === 0) {
      missed++;
      continue;
    }

    let oi = hits[0];
    if (hits.length > 1) {
      oi = hits.reduce((best, h) =>
        Math.abs(h - ni) < Math.abs(best - ni) ? h : best
      );
    }

    const oldLine = oldLines[oi];
    const ws = line.match(/^\s*/)[0];
    newLines[ni] = ws + oldLine.trimStart();
    replaced++;
  }

  fs.writeFileSync(path.join(ROOT, newPath), newLines.join("\n"), "utf8");
  console.log(newPath, "lines restored:", replaced, "unmatched:", missed);
}

function main() {
  for (const [n, o] of FILES) mergeFile(n, o);
}

main();
