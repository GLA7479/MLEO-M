import { useState } from "react";
import SoloV2ActionBar from "./SoloV2ActionBar";
import SoloV2Modal from "./SoloV2Modal";
import SoloV2ReservedAdSlot from "./SoloV2ReservedAdSlot";
import SoloV2StatusPanel from "./SoloV2StatusPanel";
import SoloV2TopHud from "./SoloV2TopHud";

export default function SoloV2GameShell({
  title,
  subtitle = "",
  balanceLabel = "Vault",
  balanceValue = "--",
  shellStatus = "idle",
  statusDetails = "",
  onBack,
  gameplaySlot,
  primaryActionLabel = "Start",
  secondaryActionLabel = "Rules",
  onPrimaryAction,
  onSecondaryAction,
  primaryDisabled = false,
  secondaryDisabled = false,
  primaryLoading = false,
  showSecondary = true,
  resultState = null,
  helpContent = null,
  statsContent = null,
}) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  return (
    <main
      className="relative h-[100dvh] max-h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
      style={{
        paddingTop: "max(8px, env(safe-area-inset-top))",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full max-w-2xl min-h-0 flex-col gap-2 px-2">
        <SoloV2TopHud
          title={title}
          subtitle={subtitle}
          balanceLabel={balanceLabel}
          balanceValue={balanceValue}
          onBack={onBack}
          onOpenStats={() => setIsStatsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          rightSlot={
            resultState ? (
              <button
                type="button"
                onClick={() => setIsResultOpen(true)}
                className="rounded-lg border border-violet-300/30 bg-violet-500/30 px-2 py-1 text-xs font-semibold text-white"
              >
                Result
              </button>
            ) : null
          }
        />

        <SoloV2StatusPanel status={shellStatus} details={statusDetails} />

        <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <div className="flex h-full min-h-0 items-center justify-center p-3">
            <div className="h-full w-full min-h-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900/50 p-2">
              {gameplaySlot || (
                <div className="flex h-full items-center justify-center text-center text-sm text-zinc-300">
                  Gameplay panel placeholder
                </div>
              )}
            </div>
          </div>
        </section>

        <SoloV2ActionBar
          primaryLabel={primaryActionLabel}
          secondaryLabel={secondaryActionLabel}
          onPrimaryAction={onPrimaryAction}
          onSecondaryAction={onSecondaryAction}
          primaryDisabled={primaryDisabled}
          secondaryDisabled={secondaryDisabled}
          primaryLoading={primaryLoading}
          showSecondary={showSecondary}
        />

        <SoloV2ReservedAdSlot />
      </div>

      <SoloV2Modal open={isHelpOpen} title="Help" onClose={() => setIsHelpOpen(false)}>
        {helpContent || (
          <p>
            This game module is in foundation stage. Gameplay rules and server-backed actions will be added in
            upcoming deliverables.
          </p>
        )}
      </SoloV2Modal>

      <SoloV2Modal open={isStatsOpen} title="Stats" onClose={() => setIsStatsOpen(false)}>
        {statsContent || (
          <p>
            Stats are not available yet. Server-authoritative session and player aggregates will appear after backend
            integration is activated.
          </p>
        )}
      </SoloV2Modal>

      <SoloV2Modal
        open={isResultOpen}
        title={resultState?.title || "Result"}
        onClose={() => setIsResultOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setIsResultOpen(false)}
            className="min-h-[42px] w-full rounded-lg border border-violet-300/30 bg-violet-500/80 px-3 py-2 text-sm font-semibold text-white"
          >
            Continue
          </button>
        }
      >
        <p className="text-sm">
          {resultState?.message || "Result display is ready. Game-specific server outcomes will be connected later."}
        </p>
        {resultState?.tone ? (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
            State: {resultState.tone}
          </div>
        ) : null}
      </SoloV2Modal>
    </main>
  );
}
