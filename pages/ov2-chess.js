import OnlineV2GamePageShell from "../components/online-v2/OnlineV2GamePageShell";

/**
 * Chess live shell + authoritative RPCs are not wired yet (see migrations/online-v2/chess).
 * Registry lists the product; shared lobby stays disabled until the engine migration ships.
 */
export default function Ov2ChessPage() {
  return (
    <OnlineV2GamePageShell title="Chess" showSubtitle={false} infoPanel={null}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-zinc-400">
        <p>Online V2 Chess is not enabled in shared rooms yet.</p>
        <p className="text-xs text-zinc-500">Apply chess SQL migrations (engine + RPCs) and re-enable the product in `onlineV2GameRegistry`.</p>
      </div>
    </OnlineV2GamePageShell>
  );
}
