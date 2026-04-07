import Link from "next/link";
import { useMemo, useState } from "react";
import Layout from "../../components/Layout";
import OnlineV2ReservedAdSlot from "../../components/online-v2/OnlineV2ReservedAdSlot";
import { Ov2UiPreviewProvider } from "../../lib/online-v2/dev/Ov2UiPreviewContext";
import {
  buildOv2UiPreviewMocks,
  buildPreviewContextInput,
  isOv2UiPreviewsEnabled,
  previewTabs,
} from "../../lib/online-v2/dev/ov2UiPreviewMocks";
import Ov2ColorClashScreen from "../../components/online-v2/colorclash/Ov2ColorClashScreen";
import Ov2DominoesScreen from "../../components/online-v2/dominoes/Ov2DominoesScreen";
import Ov2FleetHuntScreen from "../../components/online-v2/fleethunt/Ov2FleetHuntScreen";
import Ov2FlipGridScreen from "../../components/online-v2/flipgrid/Ov2FlipGridScreen";
import Ov2FourLineScreen from "../../components/online-v2/fourline/Ov2FourLineScreen";
import Ov2GoalDuelScreen from "../../components/online-v2/goal-duel/Ov2GoalDuelScreen";
import Ov2MeldMatchScreen from "../../components/online-v2/meldmatch/Ov2MeldMatchScreen";

const PREVIEW_BY_TAB = {
  dominoes: Ov2DominoesScreen,
  fourline: Ov2FourLineScreen,
  flipgrid: Ov2FlipGridScreen,
  meldmatch: Ov2MeldMatchScreen,
  colorclash: Ov2ColorClashScreen,
  fleethunt: Ov2FleetHuntScreen,
  goalduel: Ov2GoalDuelScreen,
};

export default function Ov2GameUiPreviewsPage() {
  const enabled = isOv2UiPreviewsEnabled();
  const tabs = previewTabs();
  const [tab, setTab] = useState(/** @type {string} */ (tabs[0]?.id || "dominoes"));
  const mocks = useMemo(() => buildOv2UiPreviewMocks(), []);

  const active = tabs.find(t => t.id === tab) || tabs[0];
  const Screen = active ? PREVIEW_BY_TAB[active.id] : null;
  const ctx = active ? buildPreviewContextInput(active.productId) : null;

  if (!enabled) {
    return (
      <Layout title="OV2 UI previews">
        <main className="mx-auto max-w-lg px-4 py-8 text-sm text-zinc-300">
          <p>UI previews are disabled in this build.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Run locally with <code className="text-zinc-400">npm run dev</code> or set{" "}
            <code className="text-zinc-400">NEXT_PUBLIC_OV2_UI_PREVIEWS=true</code>.
          </p>
          <Link href="/online-v2/rooms" className="mt-4 inline-block text-sky-400 underline">
            Back to rooms
          </Link>
        </main>
      </Layout>
    );
  }

  return (
    <Layout title="OV2 UI previews (no DB)">
      <main
        className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
        }}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-1 overflow-hidden px-2 pt-0 pb-1 md:max-w-4xl md:px-4">
          <header className="shrink-0 space-y-1 rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href="/online-v2/rooms"
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
              >
                ← Rooms
              </Link>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">UI only · no SQL</span>
            </div>
            <p className="text-[11px] leading-snug text-amber-100/85">
              Static mock data — layout and copy only. Game rules and server behavior are not validated here. Remove this
              route when done.
            </p>
            <div className="flex flex-wrap gap-1">
              {tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    tab === t.id ? "bg-amber-600/80 text-white" : "bg-black/30 text-zinc-400 hover:bg-black/45"
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </header>

          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
            {Screen && ctx ? (
              <Ov2UiPreviewProvider mocks={mocks}>
                <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col">
                  <Screen contextInput={ctx} />
                </div>
              </Ov2UiPreviewProvider>
            ) : (
              <div className="p-4 text-sm text-zinc-500">Nothing to show.</div>
            )}
          </div>
        </div>

        <div
          className="mx-auto w-full max-w-2xl shrink-0 px-0 md:max-w-4xl"
          style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
        >
          <OnlineV2ReservedAdSlot />
        </div>
      </main>
    </Layout>
  );
}
