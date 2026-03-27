import { useState } from "react";
import SoloV2ActionBar from "./SoloV2ActionBar";
import SoloV2Modal from "./SoloV2Modal";
import SoloV2ReservedAdSlot from "./SoloV2ReservedAdSlot";
import SoloV2StatusPanel from "./SoloV2StatusPanel";
import SoloV2TopHud from "./SoloV2TopHud";
import SoloV2GameUserMenuContent from "./SoloV2GameUserMenuContent";

export default function SoloV2GameShell({
  title,
  subtitle = "",
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
  hideStatusPanel = false,
  hideActionBar = false,
  menuVaultBalance = 0,
}) {
  const [infoTab, setInfoTab] = useState("help");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  function openInfo() {
    setInfoTab("help");
    setIsInfoOpen(true);
  }

  return (
    <main
      className="relative h-[100dvh] max-h-[100dvh] overflow-hidden text-white"
      style={{
        paddingTop: "max(8px, env(safe-area-inset-top))",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        background:
          "radial-gradient(ellipse 85% 60% at 50% 22%, rgba(180, 83, 9, 0.14), transparent 55%), radial-gradient(ellipse 90% 45% at 50% 92%, rgba(0, 0, 0, 0.45), transparent 50%), linear-gradient(180deg, #0a0908 0%, #171717 42%, #0c0a09 100%)",
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-lg min-h-0 flex-col gap-1.5 px-3 sm:gap-2 sm:px-4">
        <SoloV2TopHud
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          onOpenInfo={openInfo}
          onOpenMenu={() => setIsMenuOpen(true)}
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

        {!hideStatusPanel ? <SoloV2StatusPanel status={shellStatus} details={statusDetails} /> : null}

        <section className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 items-stretch justify-center">
            <div className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden">{gameplaySlot}</div>
          </div>
        </section>

        {!hideActionBar ? (
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
        ) : null}

        <SoloV2ReservedAdSlot variant="subtle" />
      </div>

      <SoloV2Modal open={isInfoOpen} title="Info" onClose={() => setIsInfoOpen(false)}>
        <div className="mb-3 flex gap-1">
          <button
            type="button"
            onClick={() => setInfoTab("help")}
            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
              infoTab === "help"
                ? "border-amber-400/40 bg-amber-500/20 text-amber-50"
                : "border-transparent bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setInfoTab("stats")}
            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
              infoTab === "stats"
                ? "border-amber-400/40 bg-amber-500/20 text-amber-50"
                : "border-transparent bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            Stats
          </button>
        </div>
        <div className="text-zinc-200">
          {infoTab === "help"
            ? helpContent || (
                <p>
                  This game module is in foundation stage. Gameplay rules and server-backed actions will be added in
                  upcoming deliverables.
                </p>
              )
            : statsContent || (
                <p>
                  Stats are not available yet. Server-authoritative session and player aggregates will appear after
                  backend integration is activated.
                </p>
              )}
        </div>
      </SoloV2Modal>

      <SoloV2Modal open={isMenuOpen} title="Menu" onClose={() => setIsMenuOpen(false)}>
        <SoloV2GameUserMenuContent vaultBalance={menuVaultBalance} onClose={() => setIsMenuOpen(false)} />
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
