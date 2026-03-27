const ENABLED_VALUE = "true";
const DISABLED_VALUE = "false";

export function isSoloV2Enabled() {
  const rawValue = String(process.env.NEXT_PUBLIC_SOLO_V2_ENABLED || "").trim().toLowerCase();
  if (rawValue === ENABLED_VALUE) return true;
  if (rawValue === DISABLED_VALUE) return false;
  return process.env.NODE_ENV !== "production";
}
