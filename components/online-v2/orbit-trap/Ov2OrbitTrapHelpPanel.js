"use client";

/**
 * Orbit Trap — sidebar / info panel copy (player-facing, non-technical).
 * @param {{ roomSnippet?: import("react").ReactNode }} props
 */
export default function Ov2OrbitTrapHelpPanel({ roomSnippet = null }) {
  return (
    <div className="space-y-3 text-[11px] leading-relaxed text-zinc-400">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Goal</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-zinc-400/95">
          <li>Pick up loose orbs until you hold two.</li>
          <li>Begin your turn on the inner ring when you are ready to go for the win.</li>
          <li>Step into the Core to win once you meet those conditions.</li>
        </ul>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Your turn — three actions</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-zinc-400/95">
          <li>
            <span className="font-semibold text-zinc-300">Move</span> — walk your pawn on the rings (and through gates).
            Choose <span className="font-semibold text-zinc-300">Move</span>, then tap a highlighted cell on the board.
          </li>
          <li>
            <span className="font-semibold text-zinc-300">Rotate</span> — spin an entire ring. Choose{" "}
            <span className="font-semibold text-zinc-300">Rotate</span>, then tap the ⟳ or ⟲ controls beside a ring on
            the board.
          </li>
          <li>
            <span className="font-semibold text-zinc-300">Lock</span> — freeze a ring so it cannot rotate. Choose{" "}
            <span className="font-semibold text-zinc-300">Lock</span>, then tap a highlighted lock pickup on the board
            (violet ⧈ cells).
          </li>
        </ul>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">What you see on the board</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-zinc-400/95">
          <li>
            <span className="font-semibold text-cyan-300/90">Fixed orb (F)</span> — part of the layout; you interact
            with loose orbs first where both exist.
          </li>
          <li>
            <span className="font-semibold text-amber-200/90">Loose orb</span> — pickup gold; counts toward your two
            orbs.
          </li>
          <li>
            <span className="font-semibold text-rose-300/90">Trap (triangle)</span> — slows your next move if you land
            there.
          </li>
          <li>
            <span className="font-semibold text-emerald-300/90">Boost (square)</span> — can extend how far you move if
            you use it on a later turn.
          </li>
          <li>
            <span className="font-semibold text-violet-300/90">Lock pickup (⧈)</span> — spend to place a ring lock (one
            token at a time).
          </li>
          <li>
            <span className="font-semibold text-zinc-300">Gates</span> — thick bridges between rings; you only cross
            where a gate exists.
          </li>
          <li>
            <span className="font-semibold text-zinc-300">Core</span> — the center; entering it wins when the goal
            conditions are met.
          </li>
        </ul>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Status tags (seat cards)</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-zinc-400/95">
          <li>
            <span className="font-semibold text-amber-200/90">Heavy</span> — carrying two orbs; still playable, but you
            feel “loaded down.”
          </li>
          <li>
            <span className="font-semibold text-rose-300/90">Stun</span> — brief lock-out from certain actions.
          </li>
          <li>
            <span className="font-semibold text-rose-200/85">Slow</span> — trap after-effect; shorter move next time.
          </li>
          <li>
            <span className="font-semibold text-emerald-200/85">Boost</span> — extra move range waiting to be used.
          </li>
          <li>
            <span className="font-semibold text-violet-200/90">Lock</span> — you hold a lock token and can lock a ring.
          </li>
        </ul>
      </section>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Good to know</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-zinc-400/95">
          <li>Rotating a ring moves every pawn and loose orb on that ring together.</li>
          <li>Every Move, Rotate, and Lock is checked on the server — illegal picks are rejected.</li>
          <li>
            <span className="font-semibold text-zinc-300">Bump</span> — if you move into someone, they may be pushed
            along the ring; if they cannot move, they get stunned instead.
          </li>
          <li>Loose orbs sit on cells until someone picks them up; if you stop holding an orb, it can show up again as a loose orb on the track.</li>
        </ul>
      </section>

      {roomSnippet ? <div className="border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">{roomSnippet}</div> : null}
    </div>
  );
}
