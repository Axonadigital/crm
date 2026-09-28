export const MOBILE_HEADER_HEIGHT = "3.5rem";
export const MOBILE_NAV_BASE_HEIGHT = "4.5rem";
export const MOBILE_NAV_CREATE_BUTTON_LIFT = "0.75rem";

export const mobileLayoutVars = {
  "--crm-mobile-safe-top": "env(safe-area-inset-top, 0px)",
  "--crm-mobile-safe-bottom": "env(safe-area-inset-bottom, 0px)",
  "--crm-mobile-header-height": MOBILE_HEADER_HEIGHT,
  "--crm-mobile-nav-base-height": MOBILE_NAV_BASE_HEIGHT,
  "--crm-mobile-nav-height":
    "calc(var(--crm-mobile-nav-base-height) + var(--crm-mobile-safe-bottom))",
  "--crm-mobile-content-top":
    "calc(var(--crm-mobile-header-height) + var(--crm-mobile-safe-top))",
  "--crm-mobile-content-bottom":
    "calc(var(--crm-mobile-nav-height) + 1rem)",
} as const;
