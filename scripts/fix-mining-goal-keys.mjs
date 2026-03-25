import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "pages", "mining.js");
let code = fs.readFileSync(p, "utf8");

const FIX = {
  es: ['    playMiners: "Jugar Miners",\n    goalDesc:', '    playMiners: "Jugar Miners",\n    howToPlayTitle: "Cómo jugar",\n    goal: "Objetivo",\n    goalDesc:'],
  fr: ['    playMiners: "Jouer Miners",\n    goalDesc:', '    playMiners: "Jouer Miners",\n    howToPlayTitle: "Comment jouer",\n    goal: "Objectif",\n    goalDesc:'],
  de: ['    playMiners: "Spiele Miners",\n    goalDesc:', '    playMiners: "Spiele Miners",\n    howToPlayTitle: "Spielanleitung",\n    goal: "Ziel",\n    goalDesc:'],
  zh: ['    playMiners: "玩矿工",\n    goalDesc:', '    playMiners: "玩矿工",\n    howToPlayTitle: "游戏说明",\n    goal: "目标",\n    goalDesc:'],
  ja: ['    playMiners: "マイナーをプレイ",\n    goalDesc:', '    playMiners: "マイナーをプレイ",\n    howToPlayTitle: "遊び方",\n    goal: "目標",\n    goalDesc:'],
  ko: ['    playMiners: "마이너 플레이",\n    goalDesc:', '    playMiners: "마이너 플레이",\n    howToPlayTitle: "플레이 방법",\n    goal: "목표",\n    goalDesc:'],
  tr: ['    playMiners: "Minerlar Oyna",\n    goalDesc:', '    playMiners: "Minerlar Oyna",\n    howToPlayTitle: "Nasıl oynanır",\n    goal: "Hedef",\n    goalDesc:'],
  it: ['    playMiners: "Gioca Miner",\n    goalDesc:', '    playMiners: "Gioca Miner",\n    howToPlayTitle: "Come giocare",\n    goal: "Obiettivo",\n    goalDesc:'],
  ka: ['    playMiners: "ითამაშე მაინერები",\n    goalDesc:', '    playMiners: "ითამაშე მაინერები",\n    howToPlayTitle: "როგორ ვითამაშოთ",\n    goal: "მიზანი",\n    goalDesc:'],
  pl: ['    playMiners: "Graj Górnicy",\n    goalDesc:', '    playMiners: "Graj Górnicy",\n    howToPlayTitle: "Jak grać",\n    goal: "Cel",\n    goalDesc:'],
  ro: ['    playMiners: "Joacă Mineri",\n    goalDesc:', '    playMiners: "Joacă Mineri",\n    howToPlayTitle: "Cum se joacă",\n    goal: "Obiectiv",\n    goalDesc:'],
  cs: ['    playMiners: "Hraj Horníci",\n    goalDesc:', '    playMiners: "Hraj Horníci",\n    howToPlayTitle: "Jak hrát",\n    goal: "Cíl",\n    goalDesc:'],
  nl: ['    playMiners: "Speel Mijnwerkers",\n    goalDesc:', '    playMiners: "Speel Mijnwerkers",\n    howToPlayTitle: "Hoe te spelen",\n    goal: "Doel",\n    goalDesc:'],
  el: ['    playMiners: "Παίξε Εξορυκτές",\n    goalDesc:', '    playMiners: "Παίξε Εξορυκτές",\n    howToPlayTitle: "Πώς να παίξεις",\n    goal: "Στόχος",\n    goalDesc:'],
  he: ['    playMiners: "שחק כורים",\n    goalDesc:', '    playMiners: "שחק כורים",\n    howToPlayTitle: "איך לשחק",\n    goal: "מטרה",\n    goalDesc:'],
};

for (const [loc, [a, b]] of Object.entries(FIX)) {
  if (!code.includes(a)) {
    console.error("missing pattern for", loc);
    process.exit(1);
  }
  code = code.replace(a, b);
}
fs.writeFileSync(p, code);
console.log("fixed goal keys");
