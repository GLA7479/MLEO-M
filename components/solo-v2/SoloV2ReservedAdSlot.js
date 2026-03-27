export default function SoloV2ReservedAdSlot({
  label = "Reserved Ad Slot",
  minHeightClass = "min-h-[52px]",
  variant = "default",
}) {
  const subtle = variant === "subtle";
  return (
    <section
      className={`flex shrink-0 items-center justify-center px-1 py-1.5 ${minHeightClass} ${
        subtle
          ? "border-t border-white/[0.06] bg-transparent opacity-80"
          : "rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2"
      }`}
      aria-label="Reserved ad slot"
    >
      <p className={`text-center font-medium text-zinc-500 ${subtle ? "text-[10px]" : "text-[11px]"}`}>{label}</p>
    </section>
  );
}
