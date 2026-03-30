import Ov2BoardPathScreen from "../components/online-v2/Ov2BoardPathScreen";
import OnlineV2GamePageShell from "../components/online-v2/OnlineV2GamePageShell";

export default function Ov2BoardPathPage() {
  /* Later: pass `contextInput` into Ov2BoardPathScreen from loaded ov2 room + members + board_path session. */
  return (
    <OnlineV2GamePageShell
      title="Board Path"
      subtitle="Path race · OV2"
      infoPanel={
        <>
          <p>
            Board Path is a shared-path multiplayer race. Full rules, stakes, and round flow will be documented here once
            the engine is connected.
          </p>
          <p className="mt-2 text-zinc-500">Board artwork is illustrative until live match state is wired.</p>
        </>
      }
    >
      <Ov2BoardPathScreen />
    </OnlineV2GamePageShell>
  );
}
