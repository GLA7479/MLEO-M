import Link from "next/link";

export default function SoloV2LobbyCard({ game }) {
  return (
    <article className="flex min-h-0 flex-col rounded-xl border border-white/15 bg-white/[0.04] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-center text-4xl leading-none">{game.emoji || "🎮"}</div>
      <h2 className="line-clamp-2 text-center text-sm font-extrabold text-white">{game.title}</h2>
      <p className="mt-1 line-clamp-2 text-center text-[11px] text-zinc-300">{game.shortDescription}</p>
      <div className="mt-auto pt-3">
        <Link
          href={game.route}
          className="flex min-h-[40px] w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${game.accent || "#6366f1"} 0%, ${game.accent || "#6366f1"}cc 100%)`,
          }}
        >
          Open
        </Link>
      </div>
    </article>
  );
}
