import type { TextStyle } from "react-native";

import { fonts as appFonts } from "@/theme/typography";

/**
 * The tenant-facing type system.
 *
 * Tenant screens are read as a consumer product rather than an operations
 * ledger: Plus Jakarta Sans Bold gives headings a clean modern silhouette,
 * while Inter keeps addresses, bill details, rules and longer descriptions
 * easy to scan on a phone. The owner and manager workspaces deliberately keep
 * their denser, heavier typography.
 */
export const tenantFonts = {
  ...appFonts,
  /** Softer than the app's ExtraBold operations heading. */
  display: "PlusJakartaSans_700Bold",
  displaySoft: "PlusJakartaSans_700Bold",
  /** Tenant controls and values use semibold instead of a blunt bold. */
  sansBold: "Inter_600SemiBold",
};

export const tenantType = {
  display: {
    fontFamily: tenantFonts.display,
    letterSpacing: -0.25,
  } satisfies TextStyle,
  brand: {
    fontFamily: tenantFonts.display,
    letterSpacing: -0.45,
  } satisfies TextStyle,
  brandItalic: {
    fontFamily: tenantFonts.display,
    letterSpacing: -0.45,
  } satisfies TextStyle,
  /**
   * The same quiet Inter treatment used by Property Board item descriptions.
   * It stays sentence case and lets the card title carry the hierarchy.
   */
  eyebrow: {
    fontFamily: tenantFonts.sans,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  } satisfies TextStyle,
  body: {
    fontFamily: tenantFonts.sans,
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  policy: {
    fontFamily: tenantFonts.sansMedium,
    fontSize: 14,
    lineHeight: 21,
  } satisfies TextStyle,
  quote: {
    fontFamily: tenantFonts.sans,
    fontSize: 14,
    lineHeight: 21,
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: tenantFonts.sansMedium,
    fontSize: 14.5,
    lineHeight: 21,
  } satisfies TextStyle,
  caption: {
    fontFamily: tenantFonts.sans,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  } satisfies TextStyle,
  action: {
    fontFamily: tenantFonts.displaySoft,
    fontSize: 12.5,
    letterSpacing: -0.05,
  } satisfies TextStyle,
  label: {
    fontFamily: tenantFonts.displaySoft,
    fontSize: 14,
    letterSpacing: -0.1,
  } satisfies TextStyle,
  metric: {
    fontFamily: tenantFonts.display,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.4,
  } satisfies TextStyle,
  mono: {
    fontFamily: tenantFonts.mono,
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
};
