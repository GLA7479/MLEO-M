// pages/play.js
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

/**
 * We mount the EmailTermsGate first. It auto-checks:
 *  - /api/auth/email/status (session)
 *  - localStorage terms key (same version as game)
 * If both pass → onPassed() loads the game module.
 * Users can also close the gate (go back to home).
 *
 * This preserves your original lazy-load game logic, but only after gate pass.
 */
const EmailTermsGate = dynamic(() => import("../components/EmailTermsGate"), {
  ssr: false,
});

export default function PlayPage() {
  const router = useRouter();

  const [showGate, setShowGate] = useState(true);
  const [GameComp, setGameComp] = useState(null);
  const [err, setErr] = useState(null);

  // Allow ?skipGate=1 for local debug (optional)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("skipGate") === "1") setShowGate(false);
  }, []);

  const loadGame = useCallback(async () => {
    let alive = true;
    try {
      // Try ../game first, then fallback to local page module (your original behavior)
      let mod;
      try {
        mod = await import("../game/mleo-miners");
      } catch {
        mod = await import("./mleo-miners");
      }
      if (alive) setGameComp(() => mod.default || mod);
    } catch (e) {
      console.error("[PLAY] failed to load game module:", e);
      if (alive) setErr(e);
    }
    return () => {
      alive = false;
    };
  }, []);

  // When gate passes, hide it and load the game
  const handlePassed = useCallback(() => {
    setShowGate(false);
    loadGame();
  }, [loadGame]);

  // If the user closes the gate instead of signing in → back to home
  const handleClose = useCallback(() => {
    router.replace("/");
  }, [router]);

  // If gate is skipped (debug), still load game
  useEffect(() => {
    if (!showGate && !GameComp && !err) {
      loadGame();
    }
  }, [showGate, GameComp, err, loadGame]);

  // Error state
  if (err) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white p-6">
        <div className="max-w-xl text-center">
          <h1 className="text-2xl font-extrabold mb-2">Failed to load game</h1>
        <p className="opacity-80 break-all">{String(err?.message || err)}</p>
        <button
          onClick={() => router.replace("/")}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition"
        >
          Back to Home
        </button>
        </div>
      </div>
    );
  }

  // Gate on top (modal). It will auto-pass through if already verified + accepted terms.
  return (
    <>
      {showGate && (
        <EmailTermsGate
          onPassed={handlePassed}
          onClose={handleClose}
        />
      )}

      {!showGate && !GameComp && (
        <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white">
          <div className="text-center">
            <img
              src="/images/logo.png"
              alt="MLEO"
              width={96}
              height={96}
              className="mx-auto mb-4 rounded-full"
            />
            <div className="text-lg font-bold">Loading game...</div>
          </div>
        </div>
      )}

      {!showGate && GameComp && <GameComp />}
    </>
  );
}
