/**
 * Mid-run bank / cash-out control inside the ladder Solo V2 gameplay card only.
 * Not a footer CTA — shown only when `show` (server allows cash-out mid session).
 */
export default function SoloV2BoardCashOutControl({
  show,
  label,
  loadingLabel,
  disabled = false,
  loading = false,
  onClick,
}) {
  if (!show) return null;
  const inactive = disabled || loading;
  return (
    <div className="flex shrink-0 justify-end px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1.5 lg:px-8">
      <button
        type="button"
        onClick={onClick}
        disabled={inactive}
        className={`inline-flex max-w-full items-center justify-center rounded-lg border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide sm:px-3 sm:py-1.5 sm:text-[10px] ${
          inactive
            ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
            : "border-amber-400/45 bg-amber-950/40 text-amber-100 hover:bg-amber-900/45"
        }`}
      >
        {loading ? loadingLabel : label}
      </button>
    </div>
  );
}
