import Link from "next/link";
import Layout from "../Layout";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";

const OV2_ROOMS_ROUTE = "/online-v2/rooms";

function isOv2HubEnabled() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ONLINE_V2_ENABLED === "false") {
    return false;
  }
  return true;
}

/**
 * OV2 main entry — shared rooms are the only supported path into Ludo and Rummy 51.
 */
export default function OnlineV2Hub() {
  const enabled = isOv2HubEnabled();

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
              <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">Multiplayer — rooms & lobby</p>
            </div>
            <OnlineV2VaultStrip />
          </header>

          {!enabled ? (
            <section className="shrink-0 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-3 text-center text-red-100 md:px-4 lg:py-3 xl:px-5">
              <h2 className="text-sm font-bold lg:text-base">Temporarily unavailable</h2>
              <p className="mt-1 text-xs opacity-90 lg:text-sm">Online V2 is disabled (NEXT_PUBLIC_ONLINE_V2_ENABLED=false).</p>
            </section>
          ) : null}

          <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2 md:p-3 lg:p-4 xl:p-5">
            {enabled ? (
              <div className="flex h-full min-h-0 flex-col items-stretch justify-center gap-3 md:gap-4" aria-label="Online V2 entry">
                <article className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/15 bg-white/[0.04] p-4 shadow-sm md:p-6 lg:p-8">
                  <div className="mb-3 flex items-center justify-center text-5xl leading-none md:text-6xl lg:text-7xl">🚪</div>
                  <h2 className="text-center text-base font-extrabold text-white md:text-lg lg:text-xl xl:text-2xl">Rooms & lobby</h2>
                  <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-zinc-300 md:text-sm lg:text-base">
                    Create or join a room for Ludo or Rummy 51, claim a seat, commit stake, and start from the shared room.
                  </p>
                  <div className="mt-auto flex flex-col gap-2 pt-6 md:pt-8">
                    <Link
                      href={OV2_ROOMS_ROUTE}
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-900/35 px-4 py-3 text-sm font-bold text-emerald-100 md:min-h-[52px] md:text-base"
                    >
                      Open rooms
                    </Link>
                    <Link
                      href="/ov2-21-challenge"
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-sky-500/40 bg-sky-900/30 px-4 py-3 text-sm font-bold text-sky-100 md:min-h-[52px] md:text-base"
                    >
                      21 Challenge (live tables)
                    </Link>
                    <Link
                      href="/ov2-community-cards"
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-violet-500/40 bg-violet-900/25 px-4 py-3 text-sm font-bold text-violet-100 md:min-h-[52px] md:text-base"
                    >
                      Community Cards (live tables)
                    </Link>
                    <Link
                      href="/ov2-color-wheel"
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm font-bold text-amber-100 md:min-h-[52px] md:text-base"
                    >
                      Color Wheel (live tables)
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
