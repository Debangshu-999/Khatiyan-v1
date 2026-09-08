export type ThemeMode = "light" | "dark";

// Khatiyan Neutral: white-first surfaces with blue reserved for actions,
// selected states, and small accents.
export const themes = {
  light: {
    /**
     * The page is white.
     *
     * <p>A slate grey (#EEF1F5) was tried app-wide to give white cards an edge,
     * and reverted. The overhauled screens open with a pale-blue wash that fades
     * downward into the page, and a tinted ground gave that fade nowhere to
     * land — the band stopped dead against a second colour instead of
     * dissolving. Cards take their edge from their border and shadow now.
     */
    background: "#FFFFFF",

    /**
     * The signed-out screens, the long forms, and chat.
     *
     * <p>All three were escapes from the app-wide grey, so all three now equal
     * `background`. Kept as named tokens rather than folded away: each marks a
     * surface that has deliberately diverged from the page once already and may
     * again, and a screen reaching for one of these says which ground it means.
     */
    authSurface: "#FFFFFF",
    /** The page under a long form: registration, editing, onboarding a tenant. */
    formSurface: "#FFFFFF",
    /** The ground a conversation's bubbles sit on. */
    chatSurface: "#FFFFFF",

    surface: "#FFFFFF",
    surfaceRaised: "#F8FAFC",
    surfaceSunken: "#F2F4F7",
    border: "#E5E7EB",
    borderStrong: "#CBD5E1",

    text: "#0F172A",
    ink: "#0F172A",
    inkSoft: "#1E293B",
    muted: "#64748B",
    kicker: "#93A4BC",

    primary: "#3F6ED8",
    primarySoft: "#EAF1FF",
    primaryDeep: "#2F56B3",
    onPrimary: "#FFFFFF",

    accent: "#A16207",
    accentSoft: "#FEF3C7",

    terracotta: "#BE5B3D",
    terracottaSoft: "#FBEDE7",

    jade: "#047857",
    jadeSoft: "#ECFDF5",
    /**
     * The fill under a selected tab.
     *
     * <p>A muted steel blue, not a saturated one: it has to hold white text at
     * 12px and sit under a page of black-on-white without becoming the first
     * thing the eye lands on. `jadeSoft` is two points off white and invisible
     * as the body of a tab; a full-strength `primary` is the CTA colour and
     * would make the navigation compete with the button that submits the form.
     */
    tabSelected: "#6D9DC5",
    /** The rule under a selected tab. Darker, so the line still reads on it. */
    tabSelectedDeep: "#4A7BA4",
    onTabSelected: "#FFFFFF",

    danger: "#DC2626",
    dangerSoft: "#FEF2F2",

    successSoft: "#ECFDF5",
    successText: "#047857",
    warningSoft: "#FFFBEB",
    // Text ON warningSoft — deliberately dark so it stays readable on the pale
    // wash. Not a fill: as a filled disc it reads brown.
    warningText: "#B45309",
    // The warning FILL, for a solid status mark or rule. Amber, so it reads as
    // yellow at a glance rather than brown.
    warning: "#F59E0B",
    neutralSoft: "#F1F5F9",
    neutralText: "#334155",

    // Deepened from 0.08 when the page briefly went grey, and kept when it went
    // back to white: on a white ground the shadow is most of what separates a
    // card from the page, so the lighter value would leave the hairline border
    // doing the job alone.
    shadow: "rgba(15, 23, 42, 0.16)",
    overlay: "rgba(15, 23, 42, 0.45)",
  },
  dark: {
    background: "#050505",
    surface: "#101010",
    surfaceRaised: "#171717",
    authSurface: "#0A0C12",
    // Both sit on the dark page ground: the grey experiment and its revert were
    // only ever a light-mode story.
    formSurface: "#050505",
    chatSurface: "#050505",
    surfaceSunken: "#080808",
    border: "#262626",
    borderStrong: "#3A3A3A",

    text: "#F7F7F7",
    ink: "#F7F7F7",
    inkSoft: "#E5E5E5",
    muted: "#A3A3A3",
    kicker: "#737373",

    primary: "#8FB2FF",
    primarySoft: "#151C2B",
    primaryDeep: "#BFD0FF",
    onPrimary: "#050505",

    accent: "#D4D4D4",
    accentSoft: "#1F1F1F",

    terracotta: "#E0916F",
    terracottaSoft: "#2A1812",

    jade: "#6EE7B7",
    jadeSoft: "#102018",
    tabSelected: "#4A6B87",
    tabSelectedDeep: "#9FC4E0",
    onTabSelected: "#FFFFFF",

    danger: "#F87171",
    dangerSoft: "#3B1118",

    successSoft: "#0B2A20",
    successText: "#34D399",
    warningSoft: "#221A08",
    warningText: "#FBBF24",
    warning: "#FBBF24",
    neutralSoft: "#1C1C1C",
    neutralText: "#D4D4D4",

    shadow: "rgba(0, 0, 0, 0.42)",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
};

export type ThemeColors = (typeof themes)["light"];
export const colors = themes.light;
