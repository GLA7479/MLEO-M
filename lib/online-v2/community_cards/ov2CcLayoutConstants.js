/**
 * Community Cards — presentation-only layout literals (Tailwind class fragments).
 * Mobile felt + hero zone: single sizes for all phases; seat spread still toggles via geometry only.
 */

/**
 * Pixels reserved below the felt for the action bar on mobile (max-sm).
 * Must match action dock `min-h-[134px]` in Ov2CcScreen.js when canAct.
 */
export const OV2_CC_MOBILE_ACTION_RESERVE_PX = 134;

/** Mobile (max-sm): felt fills viewport up to reserved action strip (78% × app height − reserve). */
export const OV2_CC_MOBILE_FELT_HEIGHT_CLASSES =
  "max-sm:h-[calc(var(--app-100vh,100svh)*0.78-134px)] max-sm:min-h-[calc(var(--app-100vh,100svh)*0.78-134px)] max-sm:max-h-[calc(var(--app-100vh,100svh)*0.78-134px)] max-sm:shrink-0";

/** Mobile: hero / hole-card strip — short band, cards flush to bottom (toward pot). */
export const OV2_CC_MOBILE_HERO_ZONE_CLASSES =
  "max-sm:h-[6.35rem] max-sm:min-h-[6.35rem] max-sm:items-end max-sm:justify-center max-sm:overflow-visible max-sm:pb-0 max-sm:pt-0";
