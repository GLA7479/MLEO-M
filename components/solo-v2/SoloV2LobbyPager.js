export default function SoloV2LobbyPager({ pageCount, pageIndex, onChange }) {
  return (
    <nav className="flex shrink-0 items-center justify-center gap-1" aria-label="Lobby pages">
      {Array.from({ length: pageCount }).map((_, idx) => {
        const active = idx === pageIndex;
        return (
          <button
            key={`page-${idx}`}
            type="button"
            onClick={() => onChange(idx)}
            className={`min-h-[34px] min-w-[34px] rounded-lg border text-xs font-extrabold ${
              active
                ? "border-violet-300/60 bg-violet-500/40 text-white"
                : "border-white/20 bg-white/5 text-zinc-200"
            }`}
            aria-label={`Lobby page ${idx + 1}`}
            aria-current={active ? "page" : undefined}
          >
            {idx + 1}
          </button>
        );
      })}
    </nav>
  );
}
