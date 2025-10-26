// pages/play.js
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

// Load game directly - no email gate needed since it's handled on homepage
const GameComponent = dynamic(() => import("../game/mleo-miners"), {
  ssr: false,
  loading: () => (
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
  ),
});

export default function PlayPage() {
  const router = useRouter();
  const [err, setErr] = useState(null);

  // Error boundary
  useEffect(() => {
    const handleError = (error) => {
      console.error("[PLAY] Game error:", error);
      setErr(error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

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

  // Load game directly
  return <GameComponent />;
}
