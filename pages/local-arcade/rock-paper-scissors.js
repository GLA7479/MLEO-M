import { useState, useRef, useEffect } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

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
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const gameRef = useRef(null);
  const controlsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
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
  const [lastResult, setLastResult] = useState(null);
  const [showP1Choice, setShowP1Choice] = useState(false);
  const [p1ChoiceDisplay, setP1ChoiceDisplay] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [resultsTimer, setResultsTimer] = useState(null);
  const [finalResult, setFinalResult] = useState(null);

  const matchWinner =
    score.p1 >= firstTo
      ? "Player 1"
      : score.p2 >= firstTo
      ? vsBot
        ? "LeoBot"
        : "Player 2"
      : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle results countdown timer
  useEffect(() => {
    if (!showResults || resultsTimer === null || resultsTimer <= 0) return;
    
    const timer = setInterval(() => {
      setResultsTimer((prev) => {
        if (prev <= 1) {
          // After countdown, finalize the round
          if (finalResult) {
            setLastResult(finalResult);
            setHistory((prevHistory) => [
              {
                round,
                p1: finalResult.p1,
                p2: finalResult.p2,
                winner: finalResult.winner,
              },
              ...prevHistory.slice(0, 4),
            ]);

            setScore((prevScore) => ({
              p1: prevScore.p1 + (finalResult.winner === "p1" ? 1 : 0),
              p2: prevScore.p2 + (finalResult.winner === "p2" ? 1 : 0),
            }));

            setRound((prevRound) => prevRound + 1);
            setPendingChoice(null);
            setActiveHuman("p1");
            setStatusMessage("Player 1: choose your move");
            setShowResults(false);
            setFinalResult(null);
            setShowP1Choice(false);
            setP1ChoiceDisplay(null);
            setResultsTimer(null);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showResults, resultsTimer, finalResult, round, vsBot]);

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
        80 + // Title, controls, messages
        safeBottom +
        32;
      const freeH = Math.max(300, rootH - used);
      document.documentElement.style.setProperty("--game-h", freeH + "px");
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

  function resolveRound(p1Choice, p2Choice) {
    if (!p1Choice || !p2Choice) return;
    let winner = "tie";
    if (beats[p1Choice] === p2Choice) winner = "p1";
    if (beats[p2Choice] === p1Choice) winner = "p2";

    const result = { p1: p1Choice, p2: p2Choice, winner };
    setFinalResult(result);
    setShowResults(true);
    setResultsTimer(3);
  }

  function handleBotRound(choice) {
    if (matchWinner || showResults) return;
    
    // Show P1 choice for 1 second
    setP1ChoiceDisplay(choice);
    setShowP1Choice(true);
    setStatusMessage("Your choice:");
    
    setTimeout(() => {
      setShowP1Choice(false);
      setP1ChoiceDisplay(null);
      const botPick = randomChoice();
      resolveRound(choice, botPick);
    }, 1000);
  }

  function handleHumanChoice(choice) {
    if (matchWinner || showResults) return;
    
    if (vsBot) {
      handleBotRound(choice);
      return;
    }

    if (activeHuman === "p1") {
      // Show P1 choice for 1 second, then hide and pass to P2
      setP1ChoiceDisplay(choice);
      setShowP1Choice(true);
      setStatusMessage("Player 1 chose:");
      
      setTimeout(() => {
        setShowP1Choice(false);
        setP1ChoiceDisplay(null);
        setPendingChoice(choice);
        setActiveHuman("p2");
        setStatusMessage("Player 2: your turn (no peeking!)");
      }, 1000);
    } else {
      // P2 chose - show results with 3 second countdown
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
    setLastResult(null);
    setShowP1Choice(false);
    setP1ChoiceDisplay(null);
    setShowResults(false);
    setResultsTimer(null);
    setFinalResult(null);
    if (fullReset) {
      setVsBot(false);
      setFirstTo(3);
    }
  }

  const backSafe = () => {
    router.push("/local-arcade");
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-[#0a101d] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-[#0a101d]"
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
              🪨📄✂️ Rock Paper Scissors
            </h1>
            <p className="text-white/70 text-xs">
              Round {round} • First to {firstTo}
            </p>
          </div>

          <div
            ref={controlsRef}
            className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Player 1</div>
              <div className="text-sm font-bold text-emerald-400">{score.p1}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Round</div>
              <div className="text-sm font-bold text-amber-400">{round}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">
                {vsBot ? "Bot" : "Player 2"}
              </div>
              <div className="text-sm font-bold text-purple-400">{score.p2}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
            <select
              value={firstTo}
              onChange={(e) => {
                setFirstTo(Number(e.target.value));
                resetMatch();
              }}
              className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold"
            >
              {[3, 5, 7].map((target) => (
                <option key={target} value={target}>
                  First to {target}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-white/80">
              <input
                type="checkbox"
                checked={vsBot}
                onChange={(e) => {
                  setVsBot(e.target.checked);
                  resetMatch();
                }}
                className="w-5 h-5"
              />
              vs Bot
            </label>
            <button
              onClick={() => resetMatch()}
              className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
            >
              Reset
            </button>
          </div>

          {matchWinner && (
            <div className="mb-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 text-sm font-semibold">
              {matchWinner} won the series!
            </div>
          )}

          {showResults && finalResult && (
            <div className="mb-1 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-200 text-center">
              <div className="text-2xl mb-1">
                {CHOICES.find((c) => c.id === finalResult.p1)?.emoji} vs{" "}
                {CHOICES.find((c) => c.id === finalResult.p2)?.emoji}
              </div>
              {resultsTimer > 0 && (
                <div className="text-xl font-bold">{resultsTimer}</div>
              )}
              {resultsTimer === 0 && (
                <div className="text-lg font-semibold">
                  {finalResult.winner === "tie"
                    ? "It's a Tie!"
                    : finalResult.winner === "p1"
                    ? "Player 1 Wins!"
                    : vsBot
                    ? "Bot Wins!"
                    : "Player 2 Wins!"}
                </div>
              )}
            </div>
          )}

          {lastResult && !matchWinner && !showResults && (
            <div className="mb-1 text-xs text-white/80">
              {CHOICES.find((c) => c.id === lastResult.p1)?.emoji} vs{" "}
              {CHOICES.find((c) => c.id === lastResult.p2)?.emoji} —{" "}
              {lastResult.winner === "tie"
                ? "Tie"
                : lastResult.winner === "p1"
                ? "P1 wins"
                : vsBot
                ? "Bot wins"
                : "P2 wins"}
            </div>
          )}

          <div
            ref={gameRef}
            className="w-full max-w-md flex flex-col items-center justify-center mb-1 flex-1"
            style={{ height: "var(--game-h, 400px)", minHeight: "300px" }}
          >
            {showP1Choice && p1ChoiceDisplay ? (
              <div className="w-full max-w-md flex flex-col items-center justify-center">
                <div className="text-sm text-white/80 mb-3 text-center font-semibold">
                  {statusMessage}
                </div>
                <div className="rounded-2xl border-2 border-emerald-400/50 bg-emerald-500/20 px-8 py-8 flex flex-row items-center justify-center gap-6">
                  <span className="text-7xl">
                    {CHOICES.find((c) => c.id === p1ChoiceDisplay)?.emoji}
                  </span>
                  <span className="text-3xl font-bold uppercase text-white/90">
                    {CHOICES.find((c) => c.id === p1ChoiceDisplay)?.label}
                  </span>
                </div>
              </div>
            ) : showResults ? (
              <div className="w-full max-w-md flex flex-col items-center justify-center">
                <div className="text-sm text-white/80 mb-3 text-center font-semibold">
                  Results in {resultsTimer}...
                </div>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="rounded-2xl border-2 border-blue-400/50 bg-blue-500/20 px-6 py-6 flex flex-col items-center justify-center gap-3">
                    <span className="text-2xl text-white/60">Player 1</span>
                    <span className="text-6xl">
                      {finalResult && CHOICES.find((c) => c.id === finalResult.p1)?.emoji}
                    </span>
                  </div>
                  <div className="rounded-2xl border-2 border-purple-400/50 bg-purple-500/20 px-6 py-6 flex flex-col items-center justify-center gap-3">
                    <span className="text-2xl text-white/60">
                      {vsBot ? "Bot" : "Player 2"}
                    </span>
                    <span className="text-6xl">
                      {finalResult && CHOICES.find((c) => c.id === finalResult.p2)?.emoji}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-md flex flex-col items-center justify-center">
                <div className="text-sm text-white/80 mb-3 text-center font-semibold">
                  {statusMessage}
                </div>
                <div className="flex flex-col gap-4 w-full">
                  {CHOICES.map((choice) => (
                    <button
                      key={choice.id}
                      onClick={() => handleHumanChoice(choice.id)}
                      disabled={!!matchWinner || showP1Choice || showResults}
                      className="rounded-2xl border-2 border-white/15 bg-black/30 px-8 py-8 flex flex-row items-center justify-center gap-6 hover:border-white/40 transition disabled:opacity-50 active:scale-95"
                    >
                      <span className="text-7xl">{choice.emoji}</span>
                      <span className="text-3xl font-bold uppercase text-white/90">
                        {choice.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div className="w-full max-w-md text-xs text-white/60 space-y-1">
              <div className="text-center font-semibold mb-1">Recent</div>
              {history.slice(0, 3).map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-black/20 px-2 py-1 rounded text-[10px]"
                >
                  <span>R{entry.round}</span>
                  <span>
                    {CHOICES.find((c) => c.id === entry.p1)?.emoji} vs{" "}
                    {CHOICES.find((c) => c.id === entry.p2)?.emoji}
                  </span>
                  <span>
                    {entry.winner === "tie"
                      ? "Tie"
                      : entry.winner === "p1"
                      ? "P1"
                      : "P2"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
