import Layout from "../../components/Layout";
import Link from "next/link";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

const LOCAL_GAMES = [
  {
    slug: "tic-tac-toe",
    title: "Tic Tac Toe XL",
    emoji: "❌⭕️",
    mode: "Turn Based • 2 Players",
    blurb: "Boards 3×3 up to 7×7 with score tracking and draws.",
    color: "from-pink-500/80 to-purple-500/80",
  },
  {
    slug: "rock-paper-scissors",
    title: "Rock · Paper · Scissors",
    emoji: "🪨📄✂️",
    mode: "Turn Based • 2 Players",
    blurb: "Fast BO series with score table and optional bot.",
    color: "from-emerald-500/80 to-teal-500/80",
  },
  {
    slug: "tap-battle",
    title: "Tap Battle",
    emoji: "⚡️",
    mode: "Simultaneous • 2 Players",
    blurb: "Each player owns a side — first to hit the goal wins.",
    color: "from-orange-500/80 to-red-500/80",
  },
  {
    slug: "memory-match",
    title: "Memory Match",
    emoji: "🧠",
    mode: "Turn Based • 1-2 Players",
    blurb: "Flip custom pairs with solo or head-to-head mode.",
    color: "from-sky-500/80 to-indigo-500/80",
  },
  {
    slug: "mine-clicker",
    title: "Mine Clicker Offline",
    emoji: "⛏️",
    mode: "Single Player",
    blurb: "Mine MLEO locally, buy upgrades, keep vault in storage.",
    color: "from-yellow-500/80 to-amber-500/80",
  },
  {
    slug: "math-master",
    title: "Math Master Challenge",
    emoji: "🧮",
    mode: "Single Player • Educational",
    blurb: "Practice math skills with addition, subtraction, and multiplication. Multiple difficulty levels.",
    color: "from-blue-500/80 to-cyan-500/80",
  },
];

export default function LocalArcadePage() {
  useIOSViewportFix();
  return (
    <Layout title="MLEO Local Arcade">
      <main className="min-h-screen bg-gradient-to-b from-[#0f111a] to-[#1b1f2b] text-white px-4 py-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <Link
              href="/arcade"
              className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm font-semibold tracking-widest"
            >
              BACK
            </Link>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">
              Offline Suite
            </p>
          </div>

          <header className="text-center space-y-4">
            <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm tracking-wider uppercase text-amber-300 font-semibold">
              🔌 Offline Ready • Same Device
            </p>
            <h1 className="text-4xl md:text-5xl font-black">
              Local Party Arcade
            </h1>
            <p className="text-white/70 max-w-2xl mx-auto">
              Couch-friendly micro games that run entirely on-device. No
              internet, no Supabase — just tap, play, and enjoy.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Badge>Touch Optimized</Badge>
              <Badge>Works Offline</Badge>
              <Badge>2–4 Players</Badge>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            {LOCAL_GAMES.map((game) => (
              <article
                key={game.slug}
                className="relative rounded-2xl border border-white/10 p-5 bg-white/5 backdrop-blur"
              >
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${game.color} opacity-15 pointer-events-none`}
                />
                <div className="relative z-10 flex items-center gap-4 mb-4">
                  <div className="text-4xl">{game.emoji}</div>
                  <div>
                    <h2 className="text-2xl font-bold">{game.title}</h2>
                    <p className="text-sm text-white/70">{game.mode}</p>
                  </div>
                </div>
                <p className="relative z-10 text-white/80 mb-5">{game.blurb}</p>
                <Link
                  href={`/local-arcade/${game.slug}`}
                  className="relative z-10 inline-flex items-center justify-center w-full px-4 py-3 rounded-xl bg-white/90 text-[#0b1220] font-semibold hover:bg-white"
                >
                  🎮 Launch Game
                </Link>
              </article>
            ))}
          </section>

          <footer className="mt-12 text-center text-sm text-white/60">
            <p>Everything is stored locally, so it runs even in airplane mode.</p>
            <p className="mt-1">
              Need online stakes? Jump back to{" "}
              <Link href="/arcade" className="text-amber-300 underline">
                MLEO Arcade
              </Link>
              .
            </p>
          </footer>
        </div>
      </main>
    </Layout>
  );
}

function Badge({ children }) {
  return (
    <span className="text-xs uppercase tracking-wide px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white/70">
      {children}
    </span>
  );
}

