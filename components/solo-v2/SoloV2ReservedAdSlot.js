export default function SoloV2ReservedAdSlot({ label = "Reserved Ad Slot", minHeightClass = "min-h-[60px]" }) {
  return (
    <section
      className={`flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 ${minHeightClass}`}
      aria-label="Reserved ad slot"
    >
      <p className="text-center text-[11px] font-medium text-zinc-400">{label}</p>
    </section>
  );
}
