import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

const LEVELS = {
  easy: {
    name: "Easy",
    addition: { max: 9 },
    subtraction: { min: 1, max: 20 },
    multiplication: { max: 5 },
    division: { max: 10, maxDivisor: 5 },
  },
  medium: {
    name: "Medium",
    addition: { max: 50 },
    subtraction: { min: 10, max: 100 },
    multiplication: { max: 10 },
    division: { max: 100, maxDivisor: 10 },
  },
  hard: {
    name: "Hard",
    addition: { max: 100 },
    subtraction: { min: 50, max: 200 },
    multiplication: { max: 12 },
    division: { max: 144, maxDivisor: 12 },
  },
};

const OPERATIONS = ["addition", "subtraction", "multiplication", "division", "mixed"];

const STORAGE_KEY = "mleo_math_master";

function generateQuestion(level, operation) {
  const ops = operation === "mixed" 
    ? ["addition", "subtraction", "multiplication", "division"][Math.floor(Math.random() * 4)]
    : operation;
  
  let a, b, correctAnswer, question;
  
  switch (ops) {
    case "addition":
      a = Math.floor(Math.random() * level.addition.max) + 1;
      b = Math.floor(Math.random() * level.addition.max) + 1;
      correctAnswer = a + b;
      question = `${a} + ${b} = ?`;
      break;
      
    case "subtraction":
      const max = level.subtraction.max;
      const min = level.subtraction.min;
      a = Math.floor(Math.random() * (max - min + 1)) + min;
      b = Math.floor(Math.random() * (a - 1)) + 1;
      correctAnswer = a - b;
      question = `${a} - ${b} = ?`;
      break;
      
    case "multiplication":
      a = Math.floor(Math.random() * level.multiplication.max) + 1;
      b = Math.floor(Math.random() * level.multiplication.max) + 1;
      correctAnswer = a * b;
      question = `${a} × ${b} = ?`;
      break;
      
    case "division":
      // Generate division questions with whole number results
      // Start with the result, then multiply by divisor to get dividend
      const divisor = Math.floor(Math.random() * (level.division.maxDivisor - 1)) + 2; // 2 to maxDivisor
      const quotient = Math.floor(Math.random() * Math.floor(level.division.max / divisor)) + 1;
      a = divisor * quotient; // dividend
      b = divisor;
      correctAnswer = quotient;
      question = `${a} ÷ ${b} = ?`;
      break;
      
    default:
      return generateQuestion(level, "addition");
  }
  
  // Generate wrong answers
  const wrongAnswers = new Set();
  while (wrongAnswers.size < 3) {
    let wrong;
    if (ops === "multiplication") {
      wrong = correctAnswer + Math.floor(Math.random() * 20) - 10;
    } else {
      wrong = correctAnswer + Math.floor(Math.random() * 10) - 5;
    }
    if (wrong !== correctAnswer && wrong > 0 && !wrongAnswers.has(wrong)) {
      wrongAnswers.add(wrong);
    }
  }
  
  const allAnswers = [correctAnswer, ...Array.from(wrongAnswers)];
  
  // Shuffle answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }
  
  return {
    question,
    correctAnswer,
    answers: allAnswers,
    operation: ops,
  };
}

export default function MathMaster() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const gameRef = useRef(null);
  const controlsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [level, setLevel] = useState("easy");
  const [operation, setOperation] = useState("mixed");
  const [gameActive, setGameActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [bestScore, setBestScore] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [showMultiplicationTable, setShowMultiplicationTable] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedCol, setSelectedCol] = useState(null);
  const [highlightedAnswer, setHighlightedAnswer] = useState(null);
  const [tableMode, setTableMode] = useState("multiplication"); // "multiplication" or "division"
  const [selectedResult, setSelectedResult] = useState(null); // For division mode
  const [selectedDivisor, setSelectedDivisor] = useState(null); // For division mode
  const [selectedCell, setSelectedCell] = useState(null); // {row, col, value} - the cell clicked from table

  useEffect(() => {
    setMounted(true);
    
    // Load best scores
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;
        if (saved[key]) {
          setBestScore(saved[key].bestScore || 0);
          setBestStreak(saved[key].bestStreak || 0);
        }
      } catch {}
    }
  }, [level, operation]);

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
        100 + // Title, score, timer
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
  }, [mounted]);

  // Timer countdown
  useEffect(() => {
    if (!gameActive || timeLeft <= 0) return;
    
    const timer = setTimeout(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [gameActive, timeLeft]);

  function startGame() {
    setGameActive(true);
    setScore(0);
    setStreak(0);
    setCorrect(0);
    setWrong(0);
    setTimeLeft(20);
    setFeedback(null);
    setSelectedAnswer(null);
    generateNewQuestion();
  }

  function stopGame() {
    setGameActive(false);
    setCurrentQuestion(null);
    setFeedback(null);
    setSelectedAnswer(null);
    
    // Save best scores
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;
        saved[key] = {
          bestScore: Math.max(saved[key]?.bestScore || 0, score),
          bestStreak: Math.max(saved[key]?.bestStreak || 0, streak),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        setBestScore(saved[key].bestScore);
        setBestStreak(saved[key].bestStreak);
      } catch {}
    }
  }

  function generateNewQuestion() {
    const question = generateQuestion(LEVELS[level], operation);
    setCurrentQuestion(question);
    setSelectedAnswer(null);
    setFeedback(null);
  }

  function handleTimeUp() {
    setWrong((prev) => prev + 1);
    setStreak(0);
    setFeedback("Time's up! Game Over! ⏰");
    setGameActive(false);
    setCurrentQuestion(null);
    setTimeLeft(20);
    
    // Save scores
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;
        saved[key] = {
          bestScore: Math.max(saved[key]?.bestScore || 0, score),
          bestStreak: Math.max(saved[key]?.bestStreak || 0, streak),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        setBestScore(saved[key].bestScore);
        setBestStreak(saved[key].bestStreak);
      } catch {}
    }
  }

  function handleAnswer(answer) {
    if (selectedAnswer || !gameActive) return;
    
    setSelectedAnswer(answer);
    const isCorrect = answer === currentQuestion.correctAnswer;
    
    if (isCorrect) {
      setScore((prev) => prev + (10 + streak));
      setStreak((prev) => prev + 1);
      setCorrect((prev) => prev + 1);
      setFeedback("Correct! 🎉");
      if ("vibrate" in navigator) navigator.vibrate?.(50);
      
      setTimeout(() => {
        generateNewQuestion();
        setTimeLeft(20);
      }, 1000);
    } else {
      setWrong((prev) => prev + 1);
      setStreak(0);
      setFeedback(`Wrong! Correct: ${currentQuestion.correctAnswer} ❌`);
      if ("vibrate" in navigator) navigator.vibrate?.(200);
      
      // Reset game and start new game after wrong answer
      setTimeout(() => {
        // Save scores before reset
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            const key = `${level}_${operation}`;
            saved[key] = {
              bestScore: Math.max(saved[key]?.bestScore || 0, score),
              bestStreak: Math.max(saved[key]?.bestStreak || 0, streak),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            setBestScore(saved[key].bestScore);
            setBestStreak(saved[key].bestStreak);
          } catch {}
        }
        
        // Reset all game state - don't auto-start
        setGameActive(false);
        setCurrentQuestion(null);
        setScore(0);
        setStreak(0);
        setCorrect(0);
        setWrong(0);
        setTimeLeft(20);
        setSelectedAnswer(null);
        setFeedback(null);
      }, 2000);
    }
  }

  function resetStats() {
    setScore(0);
    setStreak(0);
    setCorrect(0);
    setWrong(0);
    setBestScore(0);
    setBestStreak(0);
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;
        delete saved[key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {}
    }
  }

  const backSafe = () => {
    router.push("/local-arcade");
  };

  const getOperationName = (op) => {
    switch (op) {
      case "addition": return "+";
      case "subtraction": return "-";
      case "multiplication": return "×";
      case "division": return "÷";
      case "mixed": return "🎲 Mixed";
      default: return op;
    }
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0f1d] to-[#141928] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-b from-[#0a0f1d] to-[#141928]"
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
              🧮 Math Master
            </h1>
            <p className="text-white/70 text-xs">
              {playerName || "Player"} • {LEVELS[level].name} • {getOperationName(operation)}
            </p>
          </div>

          <div
            ref={controlsRef}
            className="grid grid-cols-4 gap-1 mb-1 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Score</div>
              <div className="text-sm font-bold text-emerald-400">{score}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Streak</div>
              <div className="text-sm font-bold text-amber-400">🔥{streak}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">✅</div>
              <div className="text-sm font-bold text-green-400">{correct}</div>
            </div>
            <div className={`rounded-lg p-1 text-center ${
              gameActive && timeLeft <= 5 
                ? "bg-red-500/30 border-2 border-red-400 animate-pulse" 
                : gameActive 
                ? "bg-black/30 border border-white/10"
                : "bg-black/30 border border-white/10"
            }`}>
              <div className="text-[10px] text-white/60">⏰ Timer</div>
              <div className={`text-lg font-black ${
                gameActive && timeLeft <= 5 
                  ? "text-red-400" 
                  : gameActive 
                  ? "text-yellow-400"
                  : "text-white/60"
              }`}>
                {gameActive ? timeLeft : "--"}
              </div>
            </div>
          </div>

          {!gameActive ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap w-full max-w-md">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Player Name"
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold placeholder:text-white/40 flex-1 min-w-[120px]"
                  maxLength={15}
                />
                <select
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setGameActive(false);
                  }}
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold"
                >
                  {Object.keys(LEVELS).map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {LEVELS[lvl].name}
                    </option>
                  ))}
                </select>
                <select
                  value={operation}
                  onChange={(e) => {
                    setOperation(e.target.value);
                    setGameActive(false);
                  }}
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold"
                >
                  {OPERATIONS.map((op) => (
                    <option key={op} value={op}>
                      {getOperationName(op)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2 w-full max-w-md">
                <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/60">Best Score</div>
                  <div className="text-lg font-bold text-emerald-400">{bestScore}</div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/60">Best Streak</div>
                  <div className="text-lg font-bold text-amber-400">{bestStreak}</div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap w-full max-w-md">
                <button
                  onClick={startGame}
                  disabled={!playerName.trim()}
                  className="h-10 px-6 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 disabled:bg-gray-500/50 disabled:cursor-not-allowed font-bold text-sm"
                >
                  ▶️ Start
                </button>
                <button
                  onClick={() => setShowMultiplicationTable(true)}
                  className="h-10 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-500 font-bold text-sm"
                >
                  📊 Times Table
                </button>
                {bestScore > 0 && (
                  <button
                    onClick={resetStats}
                    className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
                  >
                    🧹 Reset
                  </button>
                )}
              </div>
              {!playerName.trim() && (
                <p className="text-xs text-white/60 text-center mb-2">
                  Enter your name to start
                </p>
              )}
            </>
          ) : (
            <>
              {feedback && (
                <div
                  className={`mb-2 px-4 py-2 rounded-lg text-sm font-semibold text-center ${
                    feedback.includes("Correct")
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-red-500/20 text-red-200"
                  }`}
                >
                  {feedback}
                </div>
              )}

              {currentQuestion && (
                <div
                  ref={gameRef}
                  className="w-full max-w-md flex flex-col items-center justify-center mb-2 flex-1"
                  style={{ height: "var(--game-h, 400px)", minHeight: "300px" }}
                >
                  <div className="text-4xl font-black text-white mb-6 text-center">
                    {currentQuestion.question}
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full">
                    {currentQuestion.answers.map((answer, idx) => {
                      const isSelected = selectedAnswer === answer;
                      const isCorrect = answer === currentQuestion.correctAnswer;
                      const isWrong = isSelected && !isCorrect;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswer(answer)}
                          disabled={!!selectedAnswer}
                          className={`rounded-xl border-2 px-6 py-6 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
                            isCorrect && isSelected
                              ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                              : isWrong
                              ? "bg-red-500/30 border-red-400 text-red-200"
                              : selectedAnswer && answer === currentQuestion.correctAnswer
                              ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                              : "bg-black/30 border-white/15 text-white hover:border-white/40"
                          }`}
                        >
                          {answer}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={stopGame}
                className="h-9 px-4 rounded-lg bg-red-500/80 hover:bg-red-500 font-bold text-sm"
              >
                ⏹️ Stop
              </button>
            </>
          )}

          {/* Multiplication Table Modal */}
          {showMultiplicationTable && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => {
                  setShowMultiplicationTable(false);
                  setSelectedRow(null);
                  setSelectedCol(null);
                  setHighlightedAnswer(null);
                  setTableMode("multiplication");
                  setSelectedResult(null);
                  setSelectedDivisor(null);
                  setSelectedCell(null);
                }}
              />
              <div className="relative w-full max-w-md max-h-[85vh] overflow-auto bg-gradient-to-b from-[#0a0f1d] to-[#141928] rounded-2xl border-2 border-white/20 shadow-2xl">
                <div className="sticky top-0 bg-gradient-to-b from-[#0a0f1d] to-[#141928] border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
                  <h2 className="text-xl font-bold text-white">📊 Multiplication Table</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className="px-2 py-1 rounded text-xs font-bold bg-white/10 hover:bg-white/20 text-white"
                    >
                      RESET
                    </button>
                    <button
                      onClick={() => {
                        setShowMultiplicationTable(false);
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setTableMode("multiplication");
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {/* Mode toggle */}
                  <div className="mb-4 flex gap-2 justify-center">
                    <button
                    onClick={() => {
                      setTableMode("multiplication");
                      setSelectedRow(null);
                      setSelectedCol(null);
                      setHighlightedAnswer(null);
                      setSelectedResult(null);
                      setSelectedDivisor(null);
                      setSelectedCell(null);
                    }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        tableMode === "multiplication"
                          ? "bg-blue-500/80 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      × Multiplication
                    </button>
                    <button
                      onClick={() => {
                        setTableMode("division");
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        tableMode === "division"
                          ? "bg-purple-500/80 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      ÷ Division
                    </button>
                  </div>

                  {/* Result window - always visible to prevent jumping */}
                  <div className="mb-3 min-h-[30px] w-full flex items-center justify-center">
                    {/* Error message for division - non-integer result */}
                    {tableMode === "division" && selectedCell && (selectedRow || selectedCol) && selectedResult && selectedDivisor && selectedResult % selectedDivisor !== 0 && (
                      <div className="w-full px-4 py-1 rounded-lg bg-red-500/20 border border-red-400/50 text-center flex items-center justify-center gap-2">
                        <span className="text-sm text-red-200 font-semibold">
                          ⚠️ Error: {selectedResult} ÷ {selectedDivisor} is not a whole number!
                        </span>
                        <span className="text-xs text-red-300">
                          ({Math.floor(selectedResult / selectedDivisor)} remainder {selectedResult % selectedDivisor})
                        </span>
                      </div>
                    )}

                    {/* Multiplication result */}
                    {tableMode === "multiplication" && selectedCell && (selectedRow || selectedCol) && (
                      <div className={`w-full px-4 py-1 rounded-lg border text-center flex items-center justify-center gap-3 ${
                        (selectedRow || selectedCell.row) * (selectedCol || selectedCell.col) === selectedCell.value
                          ? "bg-emerald-500/20 border-emerald-400/50"
                          : "bg-red-500/20 border-red-400/50"
                      }`}>
                        <span className="text-base text-white/80">
                          {selectedRow || selectedCell.row} × {selectedCol || selectedCell.col} =
                        </span>
                        <span className={`text-xl font-bold ${
                          (selectedRow || selectedCell.row) * (selectedCol || selectedCell.col) === selectedCell.value
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}>
                          {selectedCell.value}
                        </span>
                        {((selectedRow || selectedCell.row) * (selectedCol || selectedCell.col) !== selectedCell.value) && (
                          <span className="text-xs text-red-300 font-semibold">
                            ⚠️ Should be {(selectedRow || selectedCell.row) * (selectedCol || selectedCell.col)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Division result */}
                    {tableMode === "division" && selectedResult && selectedDivisor && selectedResult % selectedDivisor === 0 && (
                      <div className="w-full px-4 py-1 rounded-lg bg-purple-500/20 border border-purple-400/50 text-center flex items-center justify-center gap-3">
                        <span className="text-base text-white/80">
                          {selectedResult} ÷ {selectedDivisor} =
                        </span>
                        <span className="text-xl font-bold text-purple-300">
                          {selectedResult / selectedDivisor}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-center">
                      <thead>
                        <tr>
                          <th className="font-bold text-white/80 p-2 bg-black/30 rounded">×</th>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => {
                            // Check if this column number is selected
                            // In multiplication: highlight if column is selected (with or without cell)
                            // In division: highlight if divisor or answer column
                            const isColSelected = (tableMode === "multiplication" && selectedCol && num === selectedCol) ||
                                                  (tableMode === "multiplication" && selectedCell && selectedRow && num === selectedCell.col) ||
                                                  (tableMode === "division" && selectedCell && selectedResult && selectedDivisor && selectedResult % selectedDivisor === 0 &&
                                                    ((selectedCol && num === selectedDivisor) || // divisor col
                                                     (selectedCol && num === Math.floor(selectedResult / selectedDivisor) && Math.floor(selectedResult / selectedDivisor) >= 1 && Math.floor(selectedResult / selectedDivisor) <= 12) || // answer col (if col selected as divisor and answer in table)
                                                     (selectedRow && num === selectedDivisor) || // divisor col (if row selected as divisor)
                                                     (selectedRow && num === Math.floor(selectedResult / selectedDivisor) && Math.floor(selectedResult / selectedDivisor) >= 1 && Math.floor(selectedResult / selectedDivisor) <= 12))); // answer col (if row selected as divisor and answer in table)
                            const isColInvalid = tableMode === "division" && selectedCell && selectedResult && 
                              selectedResult % num !== 0;
                            return (
                              <th
                                key={num}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (tableMode === "multiplication") {
                                    // Click on column: select column number and highlight full column
                                    // Second click on same column: toggle off
                                    // Keep row selection - don't clear it!
                                    if (selectedCol === num) {
                                      // Already selected - toggle off
                                      setSelectedCol(null);
                                    } else {
                                      setSelectedCol(num);
                                      // Don't clear row - allow both to be selected together!
                                    }
                                  } else {
                                    // Division mode: click selects divisor
                                    // Allow if the result will be a whole number (any positive integer)
                                    if (selectedResult && selectedCell) {
                                      const quotient = selectedResult / num;
                                      if (quotient === Math.floor(quotient) && quotient > 0) {
                                        if (selectedDivisor === num) {
                                          // Already selected - toggle off
                                          setSelectedDivisor(null);
                                          setSelectedCol(null);
                                        } else {
                                          setSelectedDivisor(num);
                                          setSelectedRow(null);
                                        }
                                      }
                                    }
                                  }
                                }}
                                className={`font-bold text-white/80 p-2 rounded min-w-[40px] cursor-pointer transition-all ${
                                  isColSelected
                                    ? tableMode === "multiplication"
                                      ? "bg-yellow-500/40 border-2 border-yellow-400"
                                      : "bg-purple-500/40 border-2 border-purple-400"
                                    : isColInvalid
                                    ? "bg-red-500/20 border border-red-400/30 opacity-50 cursor-not-allowed"
                                    : "bg-black/30 hover:bg-black/40"
                                }`}
                                style={{ pointerEvents: 'auto', zIndex: 10 }}
                              >
                                {num}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((row) => (
                          <tr key={row}>
                            <td
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (tableMode === "multiplication") {
                                  // Click on row: select row number and highlight full row
                                  // Second click on same row: toggle off
                                  // Keep column selection - don't clear it!
                                  if (selectedRow === row) {
                                    // Already selected - toggle off
                                    setSelectedRow(null);
                                  } else {
                                    setSelectedRow(row);
                                    // Don't clear column - allow both to be selected together!
                                  }
                                } else {
                                  // Division mode: click selects divisor
                                  // Allow if the result will be a whole number (any positive integer)
                                  if (selectedResult && selectedCell) {
                                    const quotient = selectedResult / row;
                                    if (quotient === Math.floor(quotient) && quotient > 0) {
                                      if (selectedDivisor === row) {
                                        // Already selected - toggle off
                                        setSelectedDivisor(null);
                                        setSelectedRow(null);
                                      } else {
                                        setSelectedDivisor(row);
                                        setSelectedCol(null);
                                      }
                                    }
                                  }
                                }
                              }}
                              className={`font-bold text-white/80 p-2 rounded cursor-pointer transition-all ${
                                // For multiplication: highlight row number (with or without cell)
                                (tableMode === "multiplication" && selectedRow && row === selectedRow) ||
                                (tableMode === "multiplication" && selectedCell && selectedCol && row === selectedCell.row) ||
                                // For division: highlight divisor row OR answer row (if answer is 1-12)
                                (tableMode === "division" && selectedCell && selectedResult && selectedDivisor && selectedResult % selectedDivisor === 0 &&
                                  ((selectedRow && row === selectedDivisor) || // divisor row
                                   (selectedRow && row === Math.floor(selectedResult / selectedDivisor) && Math.floor(selectedResult / selectedDivisor) >= 1 && Math.floor(selectedResult / selectedDivisor) <= 12) || // answer row (if row selected as divisor and answer in table)
                                   (selectedCol && row === selectedDivisor) || // divisor row (if col selected as divisor)
                                   (selectedCol && row === Math.floor(selectedResult / selectedDivisor) && Math.floor(selectedResult / selectedDivisor) >= 1 && Math.floor(selectedResult / selectedDivisor) <= 12))) // answer row (if col selected as divisor and answer in table)
                                  ? tableMode === "multiplication"
                                    ? "bg-yellow-500/40 border-2 border-yellow-400"
                                    : "bg-purple-500/40 border-2 border-purple-400"
                                  : tableMode === "division" && selectedCell && selectedResult && 
                                    selectedResult % row !== 0
                                  ? "bg-red-500/20 border border-red-400/30 opacity-50 cursor-not-allowed"
                                  : "bg-black/30 hover:bg-black/40"
                              }`}
                              style={{ pointerEvents: 'auto', zIndex: 10 }}
                            >
                              {row}
                            </td>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((col) => {
                              const value = row * col;
                              // Check if this is the selected cell from the table
                              const isCellSelected = selectedCell && selectedCell.row === row && selectedCell.col === col;
                              
                              // For multiplication: check if this cell is in the selected row or column (full row/col highlight)
                              // Works with or without selectedCell - allows clicking rows/cols independently
                              const isRowSelected = tableMode === "multiplication" && selectedRow && row === selectedRow;
                              const isColSelected = tableMode === "multiplication" && selectedCol && col === selectedCol;
                              
                              // For multiplication: highlight the answer cell (intersection of selected row and column)
                              let isAnswerCellMultiplication = false;
                              if (tableMode === "multiplication") {
                                if (selectedRow && selectedCol && row === selectedRow && col === selectedCol) {
                                  // Both row and column selected - highlight intersection
                                  isAnswerCellMultiplication = true;
                                } else if (selectedRow && !selectedCol && selectedCell && row === selectedRow && col === selectedCell.col) {
                                  // Row selected + cell from table - highlight intersection
                                  isAnswerCellMultiplication = true;
                                } else if (selectedCol && !selectedRow && selectedCell && row === selectedCell.row && col === selectedCol) {
                                  // Column selected + cell from table - highlight intersection
                                  isAnswerCellMultiplication = true;
                                }
                              }
                              
                              // For division: highlight cell at intersection of selected row/col
                              let isDivisionIntersection = false;
                              if (tableMode === "division" && selectedCell && selectedResult && selectedDivisor) {
                                if (selectedRow && row === selectedRow && col === selectedCell.col) {
                                  isDivisionIntersection = true;
                                } else if (selectedCol && row === selectedCell.row && col === selectedCol) {
                                  isDivisionIntersection = true;
                                }
                              }
                              
                              // For division: check if this is the answer cell
                              // If selectedResult ÷ selectedDivisor = answer, we need to highlight:
                              // 1. The selected cell (selectedResult) - already checked as isCellSelected
                              // 2. The divisor row/col - will be highlighted separately
                              // 3. The answer cell - only if answer is between 1-12 (appears in table)
                              let isAnswerCell = false;
                              if (tableMode === "division" && selectedCell && selectedResult && selectedDivisor && selectedResult % selectedDivisor === 0) {
                                const answer = selectedResult / selectedDivisor;
                                // Only highlight answer cell if it's in the table (1-12)
                                if (answer >= 1 && answer <= 12) {
                                  // If we selected a row as divisor, answer is in that row, column = answer
                                  if (selectedRow && selectedRow === selectedDivisor && row === selectedDivisor && col === answer) {
                                    isAnswerCell = true;
                                  }
                                  // If we selected a column as divisor, answer is in that column, row = answer
                                  if (selectedCol && selectedCol === selectedDivisor && col === selectedDivisor && row === answer) {
                                    isAnswerCell = true;
                                  }
                                  // Also highlight if this cell equals the answer value (in case answer appears multiple times)
                                  if (value === answer && ((selectedRow && row === selectedDivisor) || (selectedCol && col === selectedDivisor))) {
                                    isAnswerCell = true;
                                  }
                                }
                              }
                              
                              return (
                                <td
                                  key={`${row}-${col}`}
                                  onClick={() => {
                                    if (tableMode === "multiplication") {
                                      // Click on table: select only the cell from the table (reset previous selections)
                                      setSelectedCell({ row, col, value });
                                      setSelectedRow(null);
                                      setSelectedCol(null);
                                      setHighlightedAnswer(null);
                                    } else {
                                      // Division mode: click on table always resets and selects new result cell
                                      setSelectedResult(value);
                                      setSelectedDivisor(null);
                                      setSelectedRow(null);
                                      setSelectedCol(null);
                                      setSelectedCell({ row, col, value });
                                    }
                                  }}
                                  className={`p-2 rounded border text-white text-sm min-w-[40px] cursor-pointer transition-all ${
                                    isCellSelected
                                      ? tableMode === "multiplication"
                                        ? "bg-emerald-500/40 border-2 border-emerald-400 text-emerald-200 font-bold text-base"
                                        : "bg-purple-500/40 border-2 border-purple-400 text-purple-200 font-bold text-base"
                                      : isAnswerCellMultiplication
                                      ? "bg-emerald-500/40 border-2 border-emerald-400 text-emerald-200 font-bold text-base"
                                      : isAnswerCell
                                      ? "bg-purple-500/40 border-2 border-purple-400 text-purple-200 font-bold text-base"
                                      : (isRowSelected || isColSelected)
                                      ? "bg-yellow-500/20 border border-yellow-400/30"
                                      : isDivisionIntersection && !isCellSelected
                                      ? "bg-purple-500/30 border border-purple-400/50"
                                      : "bg-black/20 border border-white/5 hover:bg-black/30"
                                  }`}
                                  style={{ pointerEvents: 'auto' }}
                                >
                                  {value}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 text-center space-y-2">
                    <div className="text-xs text-white/60 mb-2 text-center">
                      {tableMode === "multiplication" 
                        ? "Click a number from the table, then a row or column number"
                        : "Click a result number, then a row/column number to see the division"}
                    </div>
                    <button
                      onClick={() => {
                        setShowMultiplicationTable(false);
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                      }}
                      className="px-6 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 font-bold text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

