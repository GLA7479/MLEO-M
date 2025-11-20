import { useState, useMemo, useEffect } from "react";
import LocalGameShell from "../../components/LocalGameShell";

const SIZES = [3, 5, 7];

const initialScore = { X: 0, O: 0, ties: 0 };

function makeBoard(size) {
  return Array(size * size).fill(null);
}

function checkWinner(board, size) {
  const lines = [];

  // Rows and columns
  for (let i = 0; i < size; i++) {
    lines.push(board.slice(i * size, i * size + size));
    const col = [];
    for (let j = 0; j < size; j++) {
      col.push(board[j * size + i]);
    }
    lines.push(col);
  }

  // Diagonals
  const diag1 = [];
  const diag2 = [];
  for (let i = 0; i < size; i++) {
    diag1.push(board[i * size + i]);
    diag2.push(board[i * size + (size - 1 - i)]);
  }
  lines.push(diag1, diag2);

  for (const line of lines) {
    if (line.every((cell) => cell && cell === line[0])) {
      return line[0];
    }
  }

  return null;
}

export default function TicTacToeXL() {
  const [size, setSize] = useState(3);
  const [board, setBoard] = useState(() => makeBoard(3));
  const [currentPlayer, setCurrentPlayer] = useState("X");
  const [score, setScore] = useState(initialScore);
  const [vsBot, setVsBot] = useState(false);
  const [winnerMessage, setWinnerMessage] = useState("");

  const winner = useMemo(() => checkWinner(board, size), [board, size]);
  const isBoardFull = board.every(Boolean);

  useEffect(() => {
    setBoard(makeBoard(size));
    setCurrentPlayer("X");
    setWinnerMessage("");
  }, [size]);

  useEffect(() => {
    if (!vsBot || currentPlayer !== "O" || winner || isBoardFull) return;
    const available = board
      .map((cell, idx) => (cell ? null : idx))
      .filter((idx) => idx !== null);
    if (available.length === 0) return;
    const timeout = setTimeout(() => {
      const pick = available[Math.floor(Math.random() * available.length)];
      handleMove(pick, true);
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vsBot, currentPlayer, winner, board, isBoardFull]);

  function handleMove(idx, isBot = false) {
    if (winner || board[idx]) return;
    if (!isBot && vsBot && currentPlayer === "O") return; // prevent tapping during bot turn

    const nextBoard = [...board];
    nextBoard[idx] = currentPlayer;
    const nextPlayer = currentPlayer === "X" ? "O" : "X";

    const potentialWinner = checkWinner(nextBoard, size);
    const full = nextBoard.every(Boolean);

    setBoard(nextBoard);

    if (potentialWinner) {
      setWinnerMessage(`${potentialWinner} wins!`);
      setScore((prev) => ({
        ...prev,
        [potentialWinner]: prev[potentialWinner] + 1,
      }));
    } else if (full) {
      setWinnerMessage("Draw!");
      setScore((prev) => ({ ...prev, ties: prev.ties + 1 }));
    } else {
      setCurrentPlayer(nextPlayer);
    }
  }

  function resetBoard() {
    setBoard(makeBoard(size));
    setCurrentPlayer("X");
    setWinnerMessage("");
  }

  function resetScore() {
    setScore(initialScore);
    resetBoard();
  }

  return (
    <LocalGameShell
      title="Tic Tac Toe XL"
      subtitle="Pick a board size (3×3 up to 7×7), trade turns, or toggle LeoBot for a casual solo battle."
      eyebrow="Turn Based • Offline"
      backgroundClass="bg-gradient-to-b from-[#05070f] via-[#0e111b] to-[#020308]"
    >
      <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 p-4 space-y-3 bg-white/5">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                ⚙️ Settings
              </h2>
              <label className="text-sm text-white/70 space-y-1 block">
                Board size
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1528] border border-white/20"
                >
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} × {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={vsBot}
                  onChange={(e) => {
                    setVsBot(e.target.checked);
                    resetBoard();
                  }}
                  className="w-5 h-5"
                />
                Play vs LeoBot (random bot)
              </label>
              <button
                onClick={resetBoard}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🔄 Reset board
              </button>
              <button
                onClick={resetScore}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
              >
                🧹 Reset score
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 p-4 space-y-3 bg-white/5 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold">
                  Turn:{" "}
                  <span className="text-emerald-300">{currentPlayer}</span>{" "}
                </div>
                {winnerMessage && (
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-sm font-semibold">
                    {winnerMessage}
                  </div>
                )}
              </div>
              <div
                className="grid gap-2 mx-auto"
                style={{
                  gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
                  maxWidth: "min(90vw, 420px)",
                }}
              >
                {board.map((cell, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleMove(idx)}
                    className="aspect-square rounded-xl bg-[#080c16] border border-white/15 text-3xl md:text-4xl font-bold flex items-center justify-center transition-all hover:bg-white/10"
                  >
                    {cell}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 rounded-2xl border border-white/10 p-4 bg-white/5">
              <h2 className="text-lg font-semibold mb-3">📊 Match Score</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <ScoreCard label="Player X" value={score.X} />
                <ScoreCard label="Draws" value={score.ties} />
                <ScoreCard label="Player O" value={score.O} />
              </div>
            </div>
      </section>
    </LocalGameShell>
  );
}

function ScoreCard({ label, value }) {
  return (
    <div className="rounded-xl bg-[#11182a] border border-white/10 py-4">
      <p className="text-sm text-white/60">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

