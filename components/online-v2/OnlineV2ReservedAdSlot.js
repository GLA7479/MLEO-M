/**
 * Permanent reserved viewport foot for OV2 game pages (ads / promo / campaigns).
 * Mirrors Solo V2 `SoloV2ReservedAdSlot` discipline — keep shell layout and sizing in sync with product rules.
 */
export default function OnlineV2ReservedAdSlot({
  label = "Reserved Ad Slot",
  minHeightClass = "min-h-[52px] lg:min-h-10",
  variant = "default",
  className = "",
}) {
  const subtle = variant === "subtle";
  return (
    <section
      className={`online-v2-reserved-ad-slot flex shrink-0 items-center justify-center px-1 py-1.5 lg:px-1 lg:py-1 ${minHeightClass} ${className} ${
        subtle
          ? "border-t border-white/[0.06] bg-transparent opacity-80"
          : "rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 lg:px-1.5 lg:py-1.5"
      }`}
      aria-label="Reserved ad slot"
    >
      <p
        className={`text-center font-medium text-zinc-500 ${subtle ? "text-[10px] lg:text-[9px]" : "text-[11px] lg:text-[10px]"}`}
      >
        {label}
      </p>
    </section>
  );
}
