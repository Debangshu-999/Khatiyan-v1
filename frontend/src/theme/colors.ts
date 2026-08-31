export type ThemeMode = "light" | "dark";

// Khatiyan Neutral: white-first surfaces with blue reserved for actions,
// selected states, and small accents.
export const themes = {
  light: {
    // Paper the cards sit ON, not a near-white that they vanish into. At
    // #FAFAFB the page was three points off the surface colour, so a white card
    // had no edge except its hairline border and every screen read as one flat
    // sheet. Slate-tinted rather than neutral grey, to stay in the same family
    // as the borders and muted text.
    background: "#EEF1F5",

    /**
     * The signed-out screens, pinned to the old near-white.
     *
     * <p>Auth has no cards to lift off a page — it is one sheet under a colour
     * band, and the grey that gives a card its edge everywhere else just made
     * that sheet look dirty. A named token rather than a literal, so the two
     * places using it stay in step and the reason travels with the value.
     */
    authSurface: "#FAFAFB",
    /**
     * The page under a long form: registration, editing, onboarding a tenant.
     *
     * <p>The value `background` held before the app-wide shade. A form is
     * mostly white cards, and the deeper grey behind them turned every section
     * into a floating panel — fine on a dashboard of tiles, wrong on a document
     * you are filling in. Its own token so these flows can hold the lighter
     * ground without the rest of the app losing the shade.
     */
    formSurface: "#FAFAFB",
    /**
     * Chat is white, not the page grey.
     *
     * <p>A conversation is bubbles on a ground, and the app-wide shade put a
     * grey ground behind grey-bordered bubbles — the two competed and the
     * thread lost its sense of being a surface you write on. Its own token
     * rather than `surface` so the chat ground can move without dragging every
     * card in the app with it, the same reason `authSurface` exists.
     */
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

    // Deepened when the page went grey. At 0.08 it was tuned for a near-white
    // background, where a card's own edge did most of the work; against
    // #EEF1F5 that reads as no shadow at all.
    shadow: "rgba(15, 23, 42, 0.16)",
    overlay: "rgba(15, 23, 42, 0.45)",
  },
  dark: {
    background: "#050505",
    surface: "#101010",
    surfaceRaised: "#171717",
    authSurface: "#0A0C12",
    // Unchanged: only the light ground was ever deepened.
    formSurface: "#050505",
    // Unchanged from the dark page ground: only the light shade regressed.
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
