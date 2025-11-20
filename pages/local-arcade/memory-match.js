import { useMemo, useState, useEffect } from "react";
import LocalGameShell from "../../components/LocalGameShell";

const CARD_POOL = ["🐶", "🐱", "🪙", "💎", "🦴", "🐾", "🦊", "🌙", "⚡️", "🔥"];

function buildDeck(pairs = 8) {
  const selection = CARD_POOL.slice(0, pairs);
  const deck = selection.flatMap((emoji, idx) => [
    { id: `${idx}-a`, emoji },
    { id: `${idx}-b`, emoji },
  ]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function MemoryMatch() {
  const [deck, setDeck] = useState(() => buildDeck());
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [twoPlayers, setTwoPlayers] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(true);

  const allMatched = matched.length === deck.length && deck.length > 0;

  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  useEffect(() => {
    if (allMatched) {
      setTimerActive(false);
    }
  }, [allMatched]);

  const gridColumns = useMemo(() => {
    if (deck.length <= 12) return 3;
    if (deck.length <= 16) return 4;
    return 5;
  }, [deck.length]);

  function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleFlip(idx) {
    if (flipped.includes(idx) || matched.includes(deck[idx].id)) return;
    if (flipped.length === 2) return;

    const nextFlipped = [...flipped, idx];
    setFlipped(nextFlipped);

    if (nextFlipped.length === 2) {
      const [firstIdx, secondIdx] = nextFlipped;
      const firstCard = deck[firstIdx];
      const secondCard = deck[secondIdx];
      setMoves((prev) => prev + 1);

      if (firstCard.emoji === secondCard.emoji) {
        setTimeout(() => {
          setMatched((prev) => [...prev, firstCard.id, secondCard.id]);
          setFlipped([]);
          if (twoPlayers) {
            setScores((prev) => {
              const copy = [...prev];
              copy[currentPlayer] += 1;
              return copy;
            });
          }
        }, 400);
      } else {
        setTimeout(() => {
          setFlipped([]);
          if (twoPlayers) {
            setCurrentPlayer((prev) => (prev === 0 ? 1 : 0));
          }
        }, 700);
      }
    }
  }

  function resetGame() {
    setDeck(buildDeck());
    setFlipped([]);
    setMatched([]);
    setScores([0, 0]);
    setMoves(0);
    setElapsed(0);
    setCurrentPlayer(0);
    setTimerActive(true);
  }

  return (
    <LocalGameShell
      title="Memory Match"
      subtitle="Match custom MLEO icons. Play solo against the clock or activate two-player scoring — whoever finds the most pairs wins."
      eyebrow="Brain Training • Offline"
      backgroundClass="bg-gradient-to-b from-[#070912] via-[#0f1526] to-[#03040a]"
    >
      <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                ⚙️ Settings
              </h2>
              <label className="flex items-center justify-between text-sm">
                Two-player mode
                <input
                  type="checkbox"
                  checked={twoPlayers}
                  onChange={(e) => {
                    setTwoPlayers(e.target.checked);
                    resetGame();
                  }}
                  className="w-5 h-5"
                />
              </label>
              <button
                onClick={resetGame}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🔄 Shuffle & restart
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col justify-center gap-3">
              <InfoRow label="Time" value={formatTime(elapsed)} />
              <InfoRow label="Moves" value={moves} />
              {twoPlayers ? (
                <InfoRow
                  label="Current turn"
                  value={`Player ${currentPlayer + 1}`}
                />
              ) : (
                <InfoRow label="Pairs found" value={matched.length / 2} />
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <h3 className="font-semibold">🏆 Scoreboard</h3>
              {twoPlayers ? (
                <div className="grid grid-cols-2 gap-3 text-center">
                  <ScoreBubble
                    label="Player 1"
                    value={scores[0]}
                    highlight={currentPlayer === 0}
                  />
                  <ScoreBubble
                    label="Player 2"
                    value={scores[1]}
                    highlight={currentPlayer === 1}
                  />
                </div>
              ) : (
                <p className="text-sm text-white/70">
                  Try to beat your best time with fewer moves!
                </p>
              )}
              {allMatched && (
                <div className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-100 text-sm text-center">
                  🎉 All pairs revealed!{" "}
                  {twoPlayers ? "Count the trophies." : "Board cleared."}
                </div>
              )}
            </div>
      </section>

      <section
        className="grid gap-3 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          maxWidth: "min(600px, 100%)",
        }}
      >
        {deck.map((card, idx) => {
          const isFlipped =
            flipped.includes(idx) || matched.includes(card.id);
          return (
            <button
              key={card.id}
              onClick={() => handleFlip(idx)}
              className={`aspect-square rounded-2xl border border-white/15 text-3xl md:text-4xl transition-all ${
                isFlipped ? "bg-white text-[#0b1324]" : "bg-[#0c1325]"
              }`}
            >
              {isFlipped ? card.emoji : "❔"}
            </button>
          );
        })}
      </section>
    </LocalGameShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-[#0d1528] rounded-xl px-3 py-2">
      <span className="text-sm text-white/60">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function ScoreBubble({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl px-3 py-4 border ${
        highlight ? "border-emerald-400/50" : "border-white/15"
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-white/60">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

