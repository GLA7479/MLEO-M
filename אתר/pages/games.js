// pages/games.js
import { useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const BG_URL = "/images/games-hero.jpg";

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-lg md:text-xl font-bold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-zinc-300 hover:text-white hover:bg-zinc-800"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4 text-zinc-200 leading-relaxed">{children}</div>
          <div className="px-5 pb-5">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GamesHub() {
  const [modal, setModal] = useState(null);
  const open = (id) => setModal(id);
  const close = () => setModal(null);

  return (
    <Layout title="MLEO — Games">
      <main
        className="min-h-screen relative text-white"
        style={{
          backgroundImage: `linear-gradient(180deg, #0b0b0d 0%, #000 100%), url('${BG_URL}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundBlendMode: "soft-light",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
     {/* Top bar: Back + Wallet connect */}
<div className="flex justify-between items-center mb-6">
  {/* Back button */}
 <Link
  href="/"
  className="rounded-full px-4 py-2 text-sm font-bold 
             bg-red-500/15 text-red-300 border border-red-500/30"
>
  ← BACK
</Link>


  {/* Wallet connect */}
  <ConnectButton
    chainStatus="none"
    accountStatus="avatar"
    showBalance={false}
    label="CONNECT"
  />
</div>



          {/* Header */}
          <header className="text-center mb-8 md:mb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-amber-300 text-xs font-semibold">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Live Testnet • Earn in-game MLEO
            </div>
            <h1 className="text-[28px] md:text-[40px] font-extrabold tracking-tight mt-3">
              Choose Your Game
            </h1>
            <p className="text-zinc-300 mt-2 max-w-2xl mx-auto">
              Two modes, one Vault. Play actively with upgrades (Miners) or let
              passive accrual run (Token Rush). You can switch anytime.
            </p>
          </header>

          {/* Cards */}
<section className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-3 items-stretch max-w-[900px] mx-auto">
  {/* MINERS */}
  <article className="rounded-2xl border border-white/5 bg-black/10 backdrop-blur-md shadow-xl p-5 flex flex-col w-full sm:max-w-[360px] min-h-[300px]">
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-[20px] sm:text-2xl font-extrabold">MLEO — Miners</h2>
        <p className="text-[14px] sm:text-sm text-zinc-300 mt-1 leading-6 break-words hyphens-auto">
          Idle & upgrades with tap gifts and boosts. Vault integration +
          on-chain CLAIM for steady, hands-on progress.
        </p>
      </div>
      <span className="ml-3 mt-1 rounded-full px-2.5 py-1 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        Active
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("miners-how")}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold"
        >
          HOW TO PLAY
        </button>
        <button
          onClick={() => open("miners-terms")}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold"
        >
          TERMS
        </button>
      </div>

      <div className="border-t border-zinc-800/80 pt-3">
        <Link
          href="/play"
          className="inline-flex w-full items-center justify-center px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-lg"
        >
          Play Miners
        </Link>
      </div>
    </div>
  </article>

  {/* TOKEN RUSH */}
  <article className="rounded-2xl border border-white/5 bg-black/10 backdrop-blur-md shadow-xl p-5 flex flex-col w-full sm:max-w-[360px] min-h-[300px]">
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-[20px] sm:text-2xl font-extrabold">MLEO — Rush</h2>
        <p className="text-[14px] sm:text-sm text-zinc-300 mt-1 leading-6 break-words hyphens-auto">
          Passive online mining with automatic offline accrual (time-capped).
          Same Vault + CLAIM flow for background gains.
        </p>
      </div>
      <span className="ml-3 mt-1 rounded-full px-2.5 py-1 text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
        Passive
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("rush-how")}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold"
        >
          HOW TO PLAY
        </button>
        <button
          onClick={() => open("rush-terms")}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold"
        >
          TERMS
        </button>
      </div>

      <div className="border-t border-zinc-800/80 pt-3">
        <Link
          href="/rush"
          className="inline-flex w-full items-center justify-center px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-extrabold shadow-lg"
        >
          Play Token Rush
        </Link>
      </div>
    </div>
  </article>
</section>

        </div>
      </main>
    </Layout>
  );
}
