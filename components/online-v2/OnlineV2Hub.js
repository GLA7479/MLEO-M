import Link from "next/link";
import { useMemo } from "react";
import Layout from "../Layout";
import { ONLINE_V2_REGISTRY } from "../../lib/online-v2/onlineV2GameRegistry";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";

const OV2_ROOMS_ROUTE = "/online-v2/rooms";

function isOv2HubEnabled() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ONLINE_V2_ENABLED === "false") {
    return false;
  }
  return true;
}

function gameStatusCopy(g) {
  if (g.phase === "scaffold") return "Early build — rooms & lobby live";
  return "Planned";
}

function gameEmoji(id) {
  if (id === "ov2_board_path") return "🛤️";
  if (id === "ov2_mark_grid") return "🔲";
  return "🎮";
}

function gameAccent(id) {
  if (id === "ov2_board_path") return "#0d9488";
  if (id === "ov2_mark_grid") return "#7c3aed";
  return "#6366f1";
}

/**
 * OV2 main entry — fixed viewport, destination-first (mirrors Arcade V2 / SoloV2ArcadeLobby). Room utilities live on `OV2_ROOMS_ROUTE`.
 */
export default function OnlineV2Hub() {
  const enabled = isOv2HubEnabled();
  const games = useMemo(() => ONLINE_V2_REGISTRY, []);

  return (
    <Layout title="Online V2">
      <main
        className="online-v2-hub-main h-[100dvh] max-h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="online-v2-lobby-stack mx-auto flex h-full w-full min-h-0 max-w-2xl flex-col gap-2 px-2 md:max-w-4xl md:px-4 lg:max-w-5xl lg:gap-2 lg:px-6 xl:max-w-6xl xl:gap-2.5 xl:px-8 2xl:max-w-7xl">
          <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2 md:px-3 lg:gap-2 lg:px-4 lg:py-2.5 xl:px-5">
            <Link
              href="/mining"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white lg:px-3 lg:py-1.5 lg:text-sm"
            >
              Back
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-sm font-extrabold sm:text-base lg:text-lg xl:text-xl">Online V2</h1>
              <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">Mobile-first multiplayer foundation</p>
            </div>
            <OnlineV2VaultStrip />
          </header>

          {!enabled ? (
            <section className="shrink-0 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-3 text-center text-red-100 md:px-4 lg:py-3 xl:px-5">
              <h2 className="text-sm font-bold lg:text-base">Temporarily unavailable</h2>
              <p className="mt-1 text-xs opacity-90 lg:text-sm">Online V2 is disabled (NEXT_PUBLIC_ONLINE_V2_ENABLED=false).</p>
            </section>
          ) : (
            <section className="shrink-0 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-3 text-center text-amber-100 md:px-4 lg:py-3 xl:px-5">
              <h2 className="text-sm font-bold lg:text-base">Server setup pending</h2>
              <p className="mt-1 text-xs opacity-90 lg:text-sm">
                Lobby routes are available. Backend migrations and full match flows may still be pending.
              </p>
            </section>
          )}

          <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2 md:p-3 lg:p-4 xl:p-5">
            {enabled ? (
              <div
                className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-2 md:gap-3 lg:gap-4 xl:grid-cols-3 xl:grid-rows-1 xl:gap-5"
                aria-label="Online V2 destinations"
              >
                {games.map(g => (
                  <article
                    key={g.id}
                    className="flex h-full min-h-0 flex-col rounded-xl border border-white/15 bg-white/[0.04] p-3 shadow-sm md:p-4 lg:p-5"
                  >
                    <div className="mb-2 flex items-center justify-center text-4xl leading-none md:text-5xl lg:mb-3 lg:text-5xl xl:text-6xl">
                      {gameEmoji(g.id)}
                    </div>
                    <h2 className="line-clamp-2 text-center text-sm font-extrabold text-white md:text-base lg:text-lg xl:text-xl">{g.title}</h2>
                    <p className="mt-1 line-clamp-2 text-center text-[11px] text-zinc-300 md:text-xs lg:text-sm xl:text-sm">{gameStatusCopy(g)}</p>
                    <div className="mt-auto pt-3 md:pt-4">
                      <Link
                        href={g.routePath}
                        className="flex min-h-[40px] w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-white md:min-h-[44px] md:text-sm lg:min-h-[48px] lg:rounded-xl lg:py-2.5 lg:text-sm xl:text-base"
                        style={{
                          background: `linear-gradient(135deg, ${gameAccent(g.id)} 0%, ${gameAccent(g.id)}cc 100%)`,
                        }}
                      >
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
                <article className="col-span-2 flex h-full min-h-0 flex-col rounded-xl border border-white/15 bg-white/[0.04] p-3 shadow-sm md:col-span-2 md:p-4 lg:p-5 xl:col-span-1">
                  <div className="mb-2 flex items-center justify-center text-3xl leading-none md:text-5xl lg:text-5xl xl:text-6xl">🚪</div>
                  <h2 className="line-clamp-1 text-center text-sm font-extrabold text-white md:text-base lg:text-lg xl:text-xl">Rooms & lobby</h2>
                  <p className="mt-1 line-clamp-2 text-center text-[11px] text-zinc-300 md:text-xs lg:text-sm xl:text-sm">
                    Create a room, join with your display name, ready up, and host start.
                  </p>
                  <div className="mt-auto pt-3 md:pt-4">
                    <Link
                      href={OV2_ROOMS_ROUTE}
                      className="flex min-h-[40px] w-full items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-900/35 px-3 py-2 text-xs font-bold text-emerald-100 md:min-h-[44px] md:text-sm lg:min-h-[48px] lg:rounded-xl lg:py-2.5 lg:text-sm xl:text-base"
                    >
                      Open rooms
                    </Link>
                  </div>
                </article>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-zinc-300">
                Online V2 is currently disabled.
              </div>
            )}
          </section>

          <section
            className="flex min-h-[52px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 md:min-h-[56px] lg:min-h-[60px] lg:px-4 xl:min-h-14"
            aria-hidden
          >
            <p className="text-center text-[11px] font-medium text-zinc-500 lg:text-xs xl:text-sm">Shared vault · OV2</p>
          </section>
        </div>
      </main>
    </Layout>
  );
}
