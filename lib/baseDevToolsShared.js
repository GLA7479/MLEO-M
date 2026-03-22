/** Shared guard for temporary BASE dev helpers (API + client UI). */
export function isBaseDevToolsEnabled() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_BASE_DEV_TOOLS === "true"
  );
}
