import { useState, useEffect } from "react";
import LocalGameShell from "../../components/LocalGameShell";

const DURATIONS = [5, 10, 15];

export default function TapBattle() {
  const [roundDuration, setRoundDuration] = useState(10);
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(roundDuration);
  const [phase, setPhase] = useState("idle"); // idle | countdown | playing | finished
  const [counts, setCounts] = useState({ left: 0, right: 0 });
  const [score, setScore] = useState({ left: 0, right: 0, ties: 0 });
  const [round, setRound] = useState(1);
  const [winnerMessage, setWinnerMessage] = useState("");

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === null) return;
    if (countdown === 0) {
      setPhase("playing");
      setCountdown(null);
      setTimeLeft(roundDuration);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, roundDuration]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      finalizeRound();
      return;
    }
    const timer = setTimeout(() => {
      setTimeLeft((prev) => Number(Math.max(prev - 0.1, 0).toFixed(1)));
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  function startRound() {
    setCounts({ left: 0, right: 0 });
    setWinnerMessage("");
    setCountdown(3);
    setPhase("countdown");
    setTimeLeft(roundDuration);
  }

  function finalizeRound() {
    setPhase("finished");
    let message = "It's a tie!";
    const nextScore = { ...score };
    if (counts.left > counts.right) {
      message = "Left player wins! 🏆";
      nextScore.left += 1;
    } else if (counts.right > counts.left) {
      message = "Right player wins! 🏆";
      nextScore.right += 1;
    } else {
      nextScore.ties += 1;
    }
    setScore(nextScore);
    setWinnerMessage(message);
  }

  function handleTap(side) {
    if (phase !== "playing") return;
    setCounts((prev) => ({ ...prev, [side]: prev[side] + 1 }));
    if ("vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
  }

  function nextRound() {
    setRound((prev) => prev + 1);
    setPhase("idle");
    setCounts({ left: 0, right: 0 });
    setWinnerMessage("");
    setTimeLeft(roundDuration);
  }

  function resetMatch() {
    setScore({ left: 0, right: 0, ties: 0 });
    setRound(1);
    nextRound();
  }

  return (
    <LocalGameShell
      title="Tap Battle"
      subtitle="Two players, two halves of the screen — tap faster than your rival before the timer ends. Perfect for portrait phones."
      eyebrow="Simultaneous • Touch Only"
      backgroundClass="bg-gradient-to-b from-[#040509] via-[#05070f] to-[#020203]"
    >
      <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                ⚙️ Controls
              </h2>
              <label className="text-sm block space-y-1">
                Round length (seconds)
                <select
                  value={roundDuration}
                  onChange={(e) => {
                    setRoundDuration(Number(e.target.value));
                    setTimeLeft(Number(e.target.value));
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1528] border border-white/20"
                >
                  {DURATIONS.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur} s
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={startRound}
                disabled={phase === "countdown" || phase === "playing"}
                className="w-full px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 font-semibold disabled:opacity-50"
              >
                ▶️ Start round
              </button>
              <button
                onClick={nextRound}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🔁 Next round
              </button>
              <button
                onClick={resetMatch}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🧹 Reset scores
              </button>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/60">
                    Round {round}
                  </p>
                  <p className="text-lg font-semibold">
                    {phase === "idle" && "Tap start to begin"}
                    {phase === "countdown" && `Get ready... ${countdown}`}
                    {phase === "playing" &&
                      `Time left: ${timeLeft.toFixed(1)} s`}
                    {phase === "finished" && winnerMessage}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white/60">Taps</p>
                  <p className="text-2xl font-bold">
                    {counts.left} : {counts.right}
                  </p>
                </div>
              </div>
            </div>
      </section>

      <section className="rounded-3xl overflow-hidden border border-white/15 grid grid-cols-2 text-center text-white">
            <button
              onClick={() => handleTap("left")}
              className={`py-16 text-3xl font-black transition-all ${
                phase === "playing"
                  ? "bg-gradient-to-br from-purple-600 to-fuchsia-600 active:scale-95"
                  : "bg-[#120f1b] opacity-80"
              }`}
            >
              Player L
              <p className="text-sm mt-2 text-white/70 tracking-widest">
                {counts.left} taps
              </p>
            </button>
            <button
              onClick={() => handleTap("right")}
              className={`py-16 text-3xl font-black transition-all ${
                phase === "playing"
                  ? "bg-gradient-to-br from-amber-500 to-orange-600 active:scale-95"
                  : "bg-[#120f1b] opacity-80"
              }`}
            >
              Player R
              <p className="text-sm mt-2 text-white/70 tracking-widest">
                {counts.right} taps
              </p>
            </button>
      </section>

      <section className="grid grid-cols-3 gap-4">
            <StatCard label="Left wins" value={score.left} color="purple" />
            <StatCard label="Ties" value={score.ties} color="slate" />
            <StatCard label="Right wins" value={score.right} color="orange" />
      </section>
    </LocalGameShell>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    purple: "from-purple-500/40 to-fuchsia-500/40",
    orange: "from-orange-500/40 to-amber-500/40",
    slate: "from-slate-600/30 to-slate-700/30",
  };
  return (
    <div className="rounded-2xl border border-white/10 p-4 bg-[#0c101c]">
      <div
        className={`rounded-xl bg-gradient-to-br ${colors[color]} px-3 py-5 text-center`}
      >
        <p className="text-sm text-white/70">{label}</p>
        <p className="text-3xl font-black">{value}</p>
      </div>
    </div>
  );
}

