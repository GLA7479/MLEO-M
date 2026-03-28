import { useState } from "react";
import SoloV2ActionBar from "./SoloV2ActionBar";
import SoloV2GameFooter from "./SoloV2GameFooter";
import SoloV2Modal from "./SoloV2Modal";
import SoloV2ReservedAdSlot from "./SoloV2ReservedAdSlot";
import SoloV2StatusPanel from "./SoloV2StatusPanel";
import SoloV2TopHud from "./SoloV2TopHud";
import SoloV2GameUserMenuContent from "./SoloV2GameUserMenuContent";

const DEFAULT_GIFT = {
  giftCount: 0,
  giftMax: 5,
  giftEnabled: true,
  giftLoading: false,
  onGiftClick: () => {},
  giftTitle: "Gifts",
  giftNextGiftAt: null,
  giftRegenMs: null,
};

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
  /** Game-specific row under title (Play / Win, etc.). Vault is rendered by the shell when menuVaultBalance is set. */
  topGameStatsSlot = null,
  /** Gift control props; merged with defaults. Pass from useSoloV2GiftShellState + overrides. */
  gift = null,
  /** When set, renders shared wager + CTA footer above the ad slot (Solo V2 master layout). */
  soloV2Footer = null,
  /** When false, gameplay area does not scroll (games that fit entirely in the viewport). */
  gameplayScrollable = true,
  /**
   * When true with gameplayScrollable false: on sm+ the gameplay stack can paint past overflow-y-hidden
   * so flex/min-h-0 layouts are not clipped (desktop only; mobile unchanged).
   */
  gameplayDesktopUnclipVertical = false,
  /** Optional outer column max-width (Tailwind classes). Default keeps existing Solo V2 width. */
  layoutMaxWidthClass = "max-w-lg",
}) {
  const [infoTab, setInfoTab] = useState("help");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  const giftProps = { ...DEFAULT_GIFT, ...(gift && typeof gift === "object" ? gift : {}) };

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
      <div
        className={`mx-auto flex h-full w-full min-h-0 flex-col gap-1.5 px-3 sm:gap-3 sm:px-4 ${layoutMaxWidthClass}`}
      >
        <SoloV2TopHud
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          onOpenInfo={openInfo}
          onOpenMenu={() => setIsMenuOpen(true)}
          headerVaultBalance={menuVaultBalance}
          topGameStatsSlot={topGameStatsSlot}
          giftCount={giftProps.giftCount}
          giftMax={giftProps.giftMax}
          giftEnabled={giftProps.giftEnabled}
          giftLoading={giftProps.giftLoading}
          onGiftClick={giftProps.onGiftClick}
          giftTitle={giftProps.giftTitle}
          giftNextGiftAt={giftProps.giftNextGiftAt}
          giftRegenMs={giftProps.giftRegenMs}
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

        <section
          className={
            gameplayDesktopUnclipVertical
              ? "min-h-0 flex-1 overflow-hidden sm:overflow-visible"
              : "min-h-0 flex-1 overflow-hidden"
          }
        >
          <div className="flex h-full min-h-0 items-stretch justify-center">
            <div
              className={`h-full w-full min-h-0 overflow-x-hidden ${
                gameplayScrollable
                  ? "overflow-y-auto"
                  : gameplayDesktopUnclipVertical
                    ? "overflow-y-hidden sm:overflow-y-visible"
                    : "overflow-y-hidden"
              }`}
            >
              {gameplaySlot}
            </div>
          </div>
        </section>

        {soloV2Footer ? <SoloV2GameFooter {...soloV2Footer} /> : null}

        {!soloV2Footer && !hideActionBar ? (
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

      <SoloV2Modal open={isInfoOpen} title="Info" onClose={() => setIsInfoOpen(false)} maxWidthClass="max-w-lg">
        <div className="mb-5 flex gap-1.5 rounded-2xl border border-white/10 bg-black/35 p-1 sm:gap-2 sm:p-1.5">
          <button
            type="button"
            onClick={() => setInfoTab("help")}
            className={`min-h-[44px] flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:py-3 ${
              infoTab === "help"
                ? "border border-amber-400/45 bg-amber-500/25 text-amber-50 shadow-sm shadow-amber-900/20"
                : "border border-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
          >
            Help
          </button>
          <button
            type="button"
            onClick={() => setInfoTab("stats")}
            className={`min-h-[44px] flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:py-3 ${
              infoTab === "stats"
                ? "border border-amber-400/45 bg-amber-500/25 text-amber-50 shadow-sm shadow-amber-900/20"
                : "border border-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
          >
            Stats
          </button>
        </div>
        <div className="text-[15px] leading-[1.65] text-zinc-200/95 [&_p]:mb-3 [&_p:last-child]:mb-0">
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
      </SoloV2Modal>
    </main>
  );
}
