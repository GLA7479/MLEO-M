// pages/mining.js
import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import GamePoolStats from "../components/GamePoolStats";

const BG_URL = "/images/games-hero.jpg";

// ===== Translations =====
const TEXT = {
  en: {
    name: "English", dir: "ltr", code: "en",
    back: "← BACK",
    liveTestnet: "Live Testnet • Earn in-game MLEO",
    chooseGame: "Choose Your Game",
    chooseGameDesc: "Three modes, one Vault. Play actively with upgrades (Miners), mine in space (Space Mining), or let passive accrual run (Token Rush). You can switch anytime.",
    miners: "MLEO — Miners",
    minersDesc: "Idle & upgrades with tap gifts and boosts. Vault integration + on-chain CLAIM for steady, hands-on progress.",
    active: "Active",
    howToPlay: "HOW TO PLAY",
    terms: "TERMS",
    playMiners: "Play Miners",
    acceptTermsToPlay: "🔒 Accept Terms to Play",
    spaceMining: "MLEO — Space Mining",
    spaceMiningDesc: "Control robots to mine asteroids in space. Explore different sectors and collect rare materials.",
    futuristic: "Futuristic",
    playSpaceMining: "Play Space Mining",
    rush: "MLEO — Rush",
    rushDesc: "Passive online mining with automatic offline accrual (time-capped). Same Vault + CLAIM flow for background gains.",
    passive: "Passive",
    playTokenRush: "Play Token Rush",
    howToPlayTitle: "How to Play",
    goal: "Goal",
    goalDesc: "Merge dogs (miners), break rocks, and earn Coins. Coins are an in-game resource used for upgrades and buying more miners. Some activity in the game can also accrue MLEO (see \"Mining & Tokens\" below).",
    boardMerging: "Board & Merging",
    boardSteps: [
      "Tap ADD on an empty slot to place a dog. Cost rises over time.",
      "Drag two dogs of the same level together to merge into a higher level.",
      "Each dog adds damage per second (DPS) to its lane. When a rock breaks you receive Coins."
    ],
    upgradesBonuses: "Upgrades & Bonuses",
    upgradesList: [
      "DPS upgrades make rocks break faster.",
      "GOLD upgrades increase the Coins you receive from each rock by 10% per upgrade.",
      "Gifts, auto-dogs and other bonuses may appear from time to time. Exact timings, drop types and balance values are dynamic and may change without notice.",
      "Diamonds can be collected and spent for special rewards. Availability and rewards are not guaranteed."
    ],
    miningTokens: "Mining & Tokens (MLEO)",
    miningList: [
      "How MLEO is accrued: Only breaking rocks can generate MLEO. A portion of the Coins you earn from rock breaks may convert into MLEO at a variable rate that is subject to in-game balancing, daily limits and anti-abuse protections.",
      "Daily limits & tapering: To keep things fair, daily accrual may taper as you approach your personal limit for the day. Limits and calculations are internal and can change.",
      "Offline progress: Limited offline progress is simulated at a reduced efficiency compared to active play. Exact values are internal and may change.",
      "CLAIM: Your accrued MLEO appears as a balance. Claiming moves it into your in-game Vault. If/when on-chain claims become available, additional unlock windows and restrictions may apply.",
      "No value promise: MLEO in this game is a utility token for entertainment. It has no intrinsic or guaranteed monetary value. Nothing here is an offer, solicitation, or promise of future value."
    ],
    goodToKnow: "Good to Know",
    goodToKnowList: [
      "Game balance, drop rates, limits and schedules are dynamic and may be changed, paused or reset at any time for stability, fairness or maintenance.",
      "Progress may be adjusted to address bugs, exploits or abuse.",
      "This is a testnet version. Data may be wiped or reset during development.",
      "Connect your wallet to claim MLEO tokens on-chain when available."
    ]
  },
  he: {
    name: "עברית", dir: "rtl", code: "he",
    back: "← חזרה",
    liveTestnet: "רשת בדיקה חיה • הרוויחו MLEO במשחק",
    chooseGame: "בחר את המשחק שלך",
    chooseGameDesc: "שלושה מצבים, Vault אחד. שחק באופן פעיל עם שדרוגים (כורים), כרה בחלל (Space Mining), או תן לצבירה פסיבית לרוץ (Token Rush). אתה יכול להחליף בכל עת.",
    miners: "MLEO — כורים",
    minersDesc: "משחק מנוחה ושדרוגים עם מתנות לחיצה והגברות. אינטגרציה עם Vault + CLAIM על השרשרת להתקדמות יציבה וידנית.",
    active: "פעיל",
    howToPlay: "איך לשחק",
    terms: "תנאים",
    playMiners: "שחק כורים",
    acceptTermsToPlay: "🔒 קבל תנאים כדי לשחק",
    spaceMining: "MLEO — כריית חלל",
    spaceMiningDesc: "שלוט ברובוטים לכריית אסטרואידים בחלל. חקור מגזרים שונים ואסוף חומרים נדירים.",
    futuristic: "עתידני",
    playSpaceMining: "שחק כריית חלל",
    rush: "MLEO — Rush",
    rushDesc: "כרייה פסיבית אונליין עם צבירה אוטומטית אופליין (מוגבלת זמן). אותו Vault + זרימת CLAIM לרווחים ברקע.",
    passive: "פסיבי",
    playTokenRush: "שחק Token Rush",
    howToPlayTitle: "איך לשחק",
    goal: "מטרה",
    goalDesc: "מזג כלבים (כורים), שבור סלעים והרווח מטבעות. מטבעות הם משאב במשחק המשמש לשדרוגים וקניית כורים נוספים. פעילות מסוימת במשחק יכולה גם לצבור MLEO (ראה \"כרייה ומטבעות\" למטה).",
    boardMerging: "לוח ומיזוג",
    boardSteps: [
      "לחץ על ADD במשבצת ריקה כדי למקם כלב. העלות עולה עם הזמן.",
      "גרור שני כלבים מאותו רמה יחד כדי למזג לרמה גבוהה יותר.",
      "כל כלב מוסיף נזק לשנייה (DPS) לנתיב שלו. כשסלע נשבר אתה מקבל מטבעות."
    ],
    upgradesBonuses: "שדרוגים ובונוסים",
    upgradesList: [
      "שדרוגי DPS גורמים לסלעים להישבר מהר יותר.",
      "שדרוגי GOLD מגדילים את המטבעות שאתה מקבל מכל סלע ב-10% לכל שדרוג.",
      "מתנות, כלבים אוטומטיים ובונוסים אחרים עשויים להופיע מעת לעת. זמנים מדויקים, סוגי נפילה וערכי איזון הם דינמיים ועשויים להשתנות ללא הודעה.",
      "יהלומים יכולים להיאסף ולהוצא על תגמולים מיוחדים. זמינות ותגמולים אינם מובטחים."
    ],
    miningTokens: "כרייה ומטבעות (MLEO)",
    miningList: [
      "איך MLEO נצבר: רק שבירת סלעים יכולה ליצור MLEO. חלק מהמטבעות שאתה מרוויח משבירת סלעים עשוי להפוך ל-MLEO בקצב משתנה הכפוף לאיזון במשחק, מגבלות יומיות והגנות מפני התעללות.",
      "מגבלות יומיות והצטמצמות: כדי לשמור על הוגנות, צבירה יומית עשויה להצטמצם ככל שאתה מתקרב למגבלה האישית שלך ליום. מגבלות וחישובים הם פנימיים ועשויים להשתנות.",
      "התקדמות אופליין: התקדמות אופליין מוגבלת מדומה ביעילות מופחתת בהשוואה למשחק פעיל. ערכים מדויקים הם פנימיים ועשויים להשתנות.",
      "CLAIM: ה-MLEO הנצבר שלך מופיע כערך. טעינה מעבירה אותו ל-Vault במשחק שלך. אם/כאשר תביעות על השרשרת יהיו זמינות, חלונות שחרור נוספים והגבלות עשויים לחול.",
      "אין הבטחת ערך: MLEO במשחק זה הוא מטבע שירות לבידור. אין לו ערך כספי מהותי או מובטח. שום דבר כאן אינו הצעה, סוליסיטציה או הבטחת ערך עתידי."
    ],
    goodToKnow: "טוב לדעת",
    goodToKnowList: [
      "איזון המשחק, שיעורי נפילה, מגבלות ולוחות זמנים הם דינמיים ועשויים להשתנות, להיעצר או להתאפס בכל עת ליציבות, הוגנות או תחזוקה.",
      "התקדמות עשויה להיות מותאמת לטיפול בבאגים, ניצול לרעה או התעללות.",
      "זוהי גרסת רשת בדיקה. נתונים עשויים להימחק או להתאפס במהלך הפיתוח.",
      "חבר את הארנק שלך לתביעת מטבעות MLEO על השרשרת כשהם זמינים."
    ]
  }
};

// ===== Terms Functions =====
function isTermsAccepted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mleoGames_termsAccepted") === "true";
}

function acceptTerms() {
  if (typeof window === "undefined") return;
  localStorage.setItem("mleoGames_termsAccepted", "true");
}

// ===== Language Functions =====
function getLanguage() {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("mleoGames_language") || "en";
}

function setLanguage(lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mleoGames_language", lang);
}

// ===== Modal Component =====
function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white text-black rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-2xl font-bold text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// ===== How to Play Component =====
function HowToPlay({ lang, onClose }) {
  const text = TEXT[lang];
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{text.howToPlayTitle}</h2>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.goal}</h3>
        <p className="text-gray-700">{text.goalDesc}</p>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.boardMerging}</h3>
        <ol className="list-decimal ml-5 space-y-2">
          {text.boardSteps.map((step, index) => (
            <li key={index} className="text-gray-700">{step}</li>
          ))}
        </ol>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.upgradesBonuses}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.upgradesList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.miningTokens}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.miningList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
      
      <section>
        <h3 className="font-bold text-lg mb-2">{text.goodToKnow}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.goodToKnowList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ===== Terms Component =====
function Terms({ onAccept, onDecline }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Terms & Conditions</h2>
      
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="font-bold text-black mb-1">1) Acceptance</h3>
          <p>By playing, you agree to these terms. If you disagree, please do not play.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">2) No Financial Advice</h3>
          <p>Nothing here is investment, legal, accounting or tax advice. You are solely responsible for your decisions.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">3) Gameplay, Balancing & Progress</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Rates/limits/drop tables/schedules/offline behavior are internal and may change, pause or reset at any time.</li>
            <li>We may adjust/rollback progress to address bugs, exploits or irregular activity.</li>
            <li>Feature availability may depend on time, region, device or account status.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">4) Mining, Vault & Claims</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Only certain actions (e.g., breaking rocks) may accrue MLEO under variable, capped rules.</li>
            <li>"CLAIM" moves accrued MLEO to your in-app <b>Vault</b>. If on-chain claims open later, they may be subject to unlock windows, rate limits, eligibility checks and other restrictions.</li>
            <li>We may change, delay or discontinue vaulting and/or on-chain claiming at any time.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">5) Wallets & Third-Party Services</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Wallet connection is optional and via third parties outside our control. Keep your devices, keys and wallets secure.</li>
            <li>Blockchain transactions are irreversible and may incur network fees. We are not responsible for losses due to user error, phishing, gas volatility, forks/reorgs, downtime or smart-contract risks.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">6) Fair Play & Prohibited Conduct</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>No bots, automation, multi-account abuse, exploits, reverse engineering or service interference.</li>
            <li>We may suspend, reset or terminate access and remove balances obtained through prohibited behavior.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">7) Availability, Data & Updates</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Service may be unavailable, interrupted or updated at any time.</li>
            <li>We may modify/discontinue features, wipe test data or migrate saves.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">8) Airdrops, Promotions & Rewards</h3>
          <p>Any events or rewards are discretionary, may change, and can have eligibility requirements. Participation does not guarantee receipt or value.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">9) Taxes</h3>
          <p>You are solely responsible for any taxes related to your use of the game and any rewards you may receive.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">10) Limitation of Liability</h3>
          <p>To the maximum extent permitted by law, we are not liable for indirect/special/consequential damages or loss of data/tokens/profits/opportunities.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">11) Indemnity</h3>
          <p>You agree to indemnify and hold us harmless from claims or expenses arising from your use of the game or violation of these Terms.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">12) Governing Law & Disputes</h3>
          <p>These Terms are governed by the laws of <b>[insert jurisdiction]</b>. Disputes resolved exclusively in <b>[insert venue]</b>.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">13) Contact</h3>
          <p>Questions? <b>[insert contact email]</b>.</p>
        </section>
          </div>
      
      <div className="flex gap-3 mt-6">
                <button
                  onClick={onAccept}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold"
                >
          Accept
                </button>
              <button
          onClick={onDecline}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold"
              >
          Decline
              </button>
          </div>
        </div>
  );
}

// ===== Language Selector =====
function LanguageSelector({ currentLang, onLanguageChange }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={currentLang}
        onChange={(e) => onLanguageChange(e.target.value)}
        className="bg-black/20 text-white text-sm rounded px-2 py-1 border border-white/20"
      >
        <option value="en">English</option>
        <option value="he">עברית</option>
      </select>
    </div>
  );
}

// ===== GamesHub Component =====
export default function GamesHub() {
  const [modal, setModal] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState("en");
  
  const open = (id) => setModal(id);
  const close = () => setModal(null);

  // Check terms on mount
  useEffect(() => {
    setMounted(true);
    const accepted = isTermsAccepted();
    setTermsAccepted(accepted);
    
    const currentLang = getLanguage();
    setLang(currentLang);
  }, []);

  const handleAcceptTerms = () => {
    acceptTerms();
    setTermsAccepted(true);
    setModal(null);
  };

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    setLang(newLang);
  };

  const text = TEXT[lang];

  if (!mounted) {
  return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!termsAccepted) {
    return (
      <Layout>
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-3xl font-bold mb-4">Welcome to MLEO Games</h1>
            <p className="text-gray-300 mb-6">Please accept our terms and conditions to continue</p>
            <button
              onClick={() => setModal("terms")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
            >
              View Terms
            </button>
          </div>
        </div>
        
        <Modal isOpen={modal === "terms"} onClose={close}>
          <Terms onAccept={handleAcceptTerms} onDecline={() => setModal(null)} />
        </Modal>
      </Layout>
    );
  }

  return (
    <Layout>
      <div 
        className="min-h-screen bg-black/90 text-white relative overflow-hidden"
        style={{
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black/60"></div>
        <div className="relative z-10 container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Navigation */}
            <div className="flex items-center justify-between mb-6">
              <Link href="/">
                <button className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors">
                  {text.back}
                </button>
              </Link>
              <div style={{ transform: 'scale(0.8)' }}>
                <ConnectButton 
                  chainStatus="none"
                  accountStatus="avatar"
                  showBalance={false}
                  label="CONNECT"
                />
              </div>
            </div>

          {/* Header */}
            <header className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-emerald-400 text-sm font-bold px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                  {text.liveTestnet}
                </span>
            </div>
            <h1 className="text-[28px] md:text-[40px] font-extrabold tracking-tight mt-3">
                {text.chooseGame}
            </h1>
            <p className="text-zinc-300 mt-2 max-w-2xl mx-auto">
                {text.chooseGameDesc}
            </p>
          </header>

            {/* Cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-3 items-stretch max-w-[1000px] mx-auto">
  {/* MINERS */}
              <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-4 flex flex-col w-full sm:max-w-[300px] min-h-[280px]">
    <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <h2 className="text-[18px] sm:text-xl font-extrabold">{text.miners}</h2>
                    <p className="text-[12px] sm:text-xs text-zinc-300 mt-1 leading-5 break-words hyphens-auto">
                      {text.minersDesc}
        </p>
      </div>
                  <span className="ml-2 mt-1 rounded-full px-2 py-1 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {text.active}
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("miners-how")}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors"
        >
                      {text.howToPlay}
        </button>
        <button
                      onClick={() => open("terms")}
                      className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-500/30 transition-colors"
        >
                      {text.terms}
        </button>
      </div>

                  <Link href="/mleo-miners">
                    <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors">
                      {text.playMiners}
          </button>
                  </Link>
    </div>
  </article>

  {/* SPACE MINING */}
              <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-4 flex flex-col w-full sm:max-w-[300px] min-h-[280px]">
    <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <h2 className="text-[18px] sm:text-xl font-extrabold">{text.spaceMining}</h2>
                    <p className="text-[12px] sm:text-xs text-zinc-300 mt-1 leading-5 break-words hyphens-auto">
                      {text.spaceMiningDesc}
        </p>
      </div>
                  <span className="ml-2 mt-1 rounded-full px-2 py-1 text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {text.futuristic}
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
                      onClick={() => open("space-how")}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors"
        >
                      {text.howToPlay}
        </button>
        <button
                      onClick={() => open("terms")}
                      className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-500/30 transition-colors"
        >
                      {text.terms}
        </button>
      </div>

                  <Link href="/space-mining">
                    <button className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors">
                      {text.playSpaceMining}
          </button>
                  </Link>
    </div>
  </article>

  {/* TOKEN RUSH */}
              <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-4 flex flex-col w-full sm:max-w-[300px] min-h-[280px]">
    <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <h2 className="text-[18px] sm:text-xl font-extrabold">{text.rush}</h2>
                    <p className="text-[12px] sm:text-xs text-zinc-300 mt-1 leading-5 break-words hyphens-auto">
                      {text.rushDesc}
        </p>
      </div>
                  <span className="ml-2 mt-1 rounded-full px-2 py-1 text-xs font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                    {text.passive}
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("rush-how")}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors"
        >
                      {text.howToPlay}
        </button>
        <button
                      onClick={() => open("terms")}
                      className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-500/30 transition-colors"
        >
                      {text.terms}
        </button>
      </div>

                  <Link href="/rush">
                    <button className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors">
                      {text.playTokenRush}
          </button>
                  </Link>
    </div>
  </article>
</section>

            {/* Game Pool Stats */}
            <div className="mb-8 max-w-4xl mx-auto">
              <GamePoolStats />
            </div>

            {/* Language Selector */}
            <div className="flex justify-center mt-8">
              <LanguageSelector currentLang={lang} onLanguageChange={handleLanguageChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modal === "miners-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} />
        </Modal>

      <Modal isOpen={modal === "space-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} />
        </Modal>

      <Modal isOpen={modal === "rush-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} />
        </Modal>

      <Modal isOpen={modal === "terms"} onClose={close}>
        <Terms onAccept={handleAcceptTerms} onDecline={() => setModal(null)} />
        </Modal>
    </Layout>
  );
}