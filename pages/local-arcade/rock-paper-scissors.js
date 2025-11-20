import { useState } from "react";
import LocalGameShell from "../../components/LocalGameShell";

const CHOICES = [
  { id: "rock", label: "Rock", emoji: "🪨" },
  { id: "paper", label: "Paper", emoji: "📄" },
  { id: "scissors", label: "Scissors", emoji: "✂️" },
];

const beats = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

function randomChoice() {
  return CHOICES[Math.floor(Math.random() * CHOICES.length)].id;
}

export default function RockPaperScissors() {
  const [vsBot, setVsBot] = useState(false);
  const [firstTo, setFirstTo] = useState(3);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [pendingChoice, setPendingChoice] = useState(null);
  const [activeHuman, setActiveHuman] = useState("p1");
  const [history, setHistory] = useState([]);
  const [statusMessage, setStatusMessage] = useState(
    "Player 1: choose your move"
  );

  const matchWinner =
    score.p1 >= firstTo
      ? "Player 1"
      : score.p2 >= firstTo
      ? vsBot
        ? "LeoBot"
        : "Player 2"
      : null;

  function resolveRound(p1Choice, p2Choice) {
    if (!p1Choice || !p2Choice) return;
    let winner = "tie";
    if (beats[p1Choice] === p2Choice) winner = "p1";
    if (beats[p2Choice] === p1Choice) winner = "p2";

    setHistory((prev) => [
      {
        round,
        p1: p1Choice,
        p2: p2Choice,
        winner,
      },
      ...prev.slice(0, 9),
    ]);

    setScore((prev) => ({
      p1: prev.p1 + (winner === "p1" ? 1 : 0),
      p2: prev.p2 + (winner === "p2" ? 1 : 0),
    }));

    setRound((prev) => prev + 1);
    setPendingChoice(null);
    setActiveHuman("p1");
    setStatusMessage("Player 1: choose your move");
  }

  function handleBotRound(choice) {
    if (matchWinner) return;
    const botPick = randomChoice();
    resolveRound(choice, botPick);
  }

  function handleHumanChoice(choice) {
    if (matchWinner) return;
    if (vsBot) {
      handleBotRound(choice);
      return;
    }

    if (activeHuman === "p1") {
      setPendingChoice(choice);
      setActiveHuman("p2");
      setStatusMessage("Player 2: your turn (no peeking!)");
    } else {
      resolveRound(pendingChoice, choice);
    }
  }

  function resetMatch(fullReset = false) {
    setRound(1);
    setScore({ p1: 0, p2: 0 });
    setHistory([]);
    setPendingChoice(null);
    setActiveHuman("p1");
    setStatusMessage("Player 1: choose your move");
    if (fullReset) {
      setVsBot(false);
      setFirstTo(3);
    }
  }

  return (
    <LocalGameShell
      title="Rock · Paper · Scissors"
      subtitle={`Best-of series up to ${firstTo} wins with optional LeoBot. Every round is logged so you can brag later.`}
      eyebrow="Quick Match • Offline"
      backgroundClass="bg-gradient-to-b from-[#05070f] via-[#0a101d] to-[#04050b]"
    >
      <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                ⚙️ Controls
              </h2>
              <label className="flex items-center justify-between text-sm">
                vs Bot (LeoBot)
                <input
                  type="checkbox"
                  checked={vsBot}
                  onChange={(e) => {
                    setVsBot(e.target.checked);
                    resetMatch();
                  }}
                  className="w-5 h-5"
                />
              </label>
              <label className="text-sm space-y-1 block">
                Target wins
                <select
                  value={firstTo}
                  onChange={(e) => {
                    setFirstTo(Number(e.target.value));
                    resetMatch();
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1528] border border-white/20"
                >
                  {[3, 5, 7].map((target) => (
                    <option key={target} value={target}>
                      First to {target}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => resetMatch()}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🔄 Restart match
              </button>
              <button
                onClick={() => resetMatch(true)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🧹 Full reset
              </button>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/50">
                    Round {round}
                  </p>
                  <p className="text-lg font-semibold">{statusMessage}</p>
                </div>
                {matchWinner && (
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-sm font-semibold">
                    {matchWinner} won the series!
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => handleHumanChoice(choice.id)}
                    className="rounded-xl border border-white/15 bg-[#0d1322] px-4 py-5 flex flex-col items-center gap-2 hover:border-white/40 transition"
                  >
                    <span className="text-4xl">{choice.emoji}</span>
                    <span className="text-sm font-semibold tracking-wide uppercase">
                      {choice.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 grid grid-cols-2 gap-4">
              <ScorePanel
                label="Player 1"
                score={score.p1}
                highlight={!matchWinner || matchWinner === "Player 1"}
              />
              <ScorePanel
                label={vsBot ? "LeoBot" : "Player 2"}
                score={score.p2}
                highlight={!matchWinner || matchWinner !== "Player 1"}
              />
            </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold mb-3">📝 Round history</h2>
        {history.length === 0 ? (
          <p className="text-white/60 text-sm">No rounds played yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li
                key={entry.round}
                className="flex items-center justify-between text-sm bg-[#0c1424] px-3 py-2 rounded-xl border border-white/5"
              >
                <span className="text-white/60">Round {entry.round}</span>
                <span>
                  {entry.p1} vs {entry.p2}
                </span>
                <span className="font-semibold">
                  {entry.winner === "tie"
                    ? "Tie"
                    : entry.winner === "p1"
                    ? "Player 1"
                    : vsBot
                    ? "LeoBot"
                    : "Player 2"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </LocalGameShell>
  );
}

function ScorePanel({ label, score, highlight }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-center ${
        highlight ? "border-emerald-400/40" : "border-white/10"
      }`}
    >
      <p className="text-sm uppercase tracking-widest text-white/60">{label}</p>
      <p className="text-4xl font-black">{score}</p>
    </div>
  );
}

