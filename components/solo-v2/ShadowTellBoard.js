/**
 * Read-only clue surface for Shadow Tell — no hidden tap targets.
 */
export default function ShadowTellBoard({ clues = [], revealCount = 0, phase = "idle", subtleCaption = "" }) {
  const list = Array.isArray(clues) ? clues : [];
  const n = list.length;
  const cap = Math.max(0, Math.min(n, Math.floor(Number(revealCount) || 0)));

  const phaseLabel =
    phase === "sealed"
      ? "Sealed stance"
      : phase === "clues"
        ? "Field tells"
        : phase === "decide"
          ? "Commit"
          : "—";

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5 sm:max-w-lg" aria-live="polite">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-violet-200/75 sm:text-[10px]">
          {phaseLabel}
        </span>
        {subtleCaption ? (
          <span className="line-clamp-1 text-[8px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[9px]">
            {subtleCaption}
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {list.map((c, idx) => {
          const isLit = idx < cap;
          return (
            <li key={c.id ?? idx}>
              <div
                className={`rounded-xl border px-3 py-2.5 text-left transition-[opacity,transform,border-color] duration-300 sm:px-3.5 sm:py-3 ${
                  isLit
                    ? "border-violet-500/40 bg-violet-950/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-zinc-800/80 bg-zinc-950/30 opacity-45"
                }`}
              >
                <p className="text-[11px] font-semibold leading-snug text-zinc-100 sm:text-xs">{isLit ? c.text : "—"}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
