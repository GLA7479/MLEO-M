import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

const DURATIONS = [5, 10, 15];

export default function TapBattle() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const battleRef = useRef(null);
  const controlsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [roundDuration, setRoundDuration] = useState(10);
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(roundDuration);
  const [phase, setPhase] = useState("idle");
  const [counts, setCounts] = useState({ left: 0, right: 0 });
  const [score, setScore] = useState({ left: 0, right: 0, ties: 0 });
  const [round, setRound] = useState(1);
  const [winnerMessage, setWinnerMessage] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Dynamic layout calculation - stable, no state dependencies
  useEffect(() => {
    if (!wrapRef.current || !mounted) return;
    const calc = () => {
      const rootH = window.visualViewport?.height ?? window.innerHeight;
      const safeBottom =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--satb")
            .replace("px", "")
        ) || 0;
      const headH = headerRef.current?.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH + "px");
      
      const controlsH = controlsRef.current?.offsetHeight || 40;
      const used =
        headH +
        controlsH +
        80 + // Title, status, score
        safeBottom +
        32;
      const freeH = Math.max(300, rootH - used);
      document.documentElement.style.setProperty("--battle-h", freeH + "px");
    };
    const timer = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
    };
  }, [mounted]); // Only depend on mounted

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
      message = "Left wins! 🏆";
      nextScore.left += 1;
    } else if (counts.right > counts.left) {
      message = "Right wins! 🏆";
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

  const backSafe = () => {
    router.push("/local-arcade");
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-[#05070f] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-[#05070f]"
        style={{ height: "100svh" }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
        </div>

        <div
          ref={headerRef}
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div
            className="relative px-2 py-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            </div>
            <div className="absolute right-2 top-2 pointer-events-auto">
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                Local
              </span>
            </div>
          </div>
        </div>

        <div
          className="relative h-full flex flex-col items-center justify-start px-4 pb-4"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">
              ⚡️ Tap Battle
            </h1>
            <p className="text-white/70 text-xs">
              Round {round} • {roundDuration}s
            </p>
          </div>

          <div
            ref={controlsRef}
            className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Left</div>
              <div className="text-sm font-bold text-purple-400">{score.left}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Ties</div>
              <div className="text-sm font-bold text-amber-400">{score.ties}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Right</div>
              <div className="text-sm font-bold text-orange-400">{score.right}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
            <select
              value={roundDuration}
              onChange={(e) => {
                setRoundDuration(Number(e.target.value));
                setTimeLeft(Number(e.target.value));
              }}
              className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold"
            >
              {DURATIONS.map((dur) => (
                <option key={dur} value={dur}>
                  {dur}s
                </option>
              ))}
            </select>
            <button
              onClick={startRound}
              disabled={phase === "countdown" || phase === "playing"}
              className="h-9 px-4 rounded-lg bg-red-500/80 hover:bg-red-500 font-bold text-sm disabled:opacity-50"
            >
              Start
            </button>
            <button
              onClick={nextRound}
              className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
            >
              Next
            </button>
            <button
              onClick={resetMatch}
              className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
            >
              Reset
            </button>
          </div>

          <div className="text-center mb-1 text-sm text-white/80 font-semibold">
            {phase === "idle" && "Tap Start to begin"}
            {phase === "countdown" && `Get ready... ${countdown}`}
            {phase === "playing" && `Time: ${timeLeft.toFixed(1)}s`}
            {phase === "finished" && winnerMessage}
          </div>

          <div className="text-center mb-1 text-3xl font-black text-white">
            {counts.left} : {counts.right}
          </div>

          <div
            ref={battleRef}
            className="w-full flex-1 grid grid-cols-2 gap-0 overflow-hidden rounded-2xl border-2 border-white/15"
            style={{ height: "var(--battle-h, 400px)", minHeight: "300px" }}
          >
            <button
              onClick={() => handleTap("left")}
              className={`transition-all flex flex-col items-center justify-center ${
                phase === "playing"
                  ? "bg-gradient-to-br from-purple-600 to-fuchsia-600 active:scale-95"
                  : "bg-[#120f1b] opacity-80"
              }`}
            >
              <div className="text-4xl font-black">L</div>
              <div className="text-sm text-white/80 font-semibold mt-2">{counts.left} taps</div>
            </button>
            <button
              onClick={() => handleTap("right")}
              className={`transition-all flex flex-col items-center justify-center ${
                phase === "playing"
                  ? "bg-gradient-to-br from-amber-500 to-orange-600 active:scale-95"
                  : "bg-[#120f1b] opacity-80"
              }`}
            >
              <div className="text-4xl font-black">R</div>
              <div className="text-sm text-white/80 font-semibold mt-2">{counts.right} taps</div>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
