export type ThemeMode = "light" | "dark";

// "Modern Khatiyan Ledger" palette — parchment, ink, terracotta, saffron, jade.
// The name "Khatiyan" means a land-record / property ledger; the palette
// borrows from that — paper-warm backgrounds, ink-deep text, clay-red accents.
export const themes = {
  light: {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceRaised: "#F8FAFC",
    surfaceSunken: "#F1F5F9",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",

    text: "#0F172A",
    ink: "#0F172A",
    inkSoft: "#334155",
    muted: "#64748B",
    kicker: "#94A3B8",

    primary: "#B8472A",
    primarySoft: "#FFF1ED",
    primaryDeep: "#8C3520",
    onPrimary: "#FFFFFF",

    accent: "#D89441",
    accentSoft: "#FFF7E8",

    jade: "#3F7257",
    jadeSoft: "#ECFDF3",

    danger: "#9B2C2C",
    dangerSoft: "#FEF2F2",

    successSoft: "#ECFDF3",
    successText: "#166534",
    warningSoft: "#FFF7E8",
    warningText: "#92400E",
    neutralSoft: "#F1F5F9",
    neutralText: "#334155",

    shadow: "rgba(15, 23, 42, 0.08)",
    overlay: "rgba(15, 23, 42, 0.45)",
  },
  dark: {
    background: "#161210",
    surface: "#1F1A16",
    surfaceRaised: "#26201B",
    surfaceSunken: "#100C0A",
    border: "#3A2F26",
    borderStrong: "#5A4A3C",

    text: "#F0E5D2",
    ink: "#F0E5D2",
    inkSoft: "#D7C9B0",
    muted: "#A89880",
    kicker: "#8A7762",

    primary: "#E07A52",
    primarySoft: "#3A1F15",
    primaryDeep: "#F19A77",
    onPrimary: "#1B1410",

    accent: "#E8B66A",
    accentSoft: "#3A2C16",

    jade: "#7CB395",
    jadeSoft: "#1F2F26",

    danger: "#E27871",
    dangerSoft: "#3A1C1A",

    successSoft: "#1F2F26",
    successText: "#7CB395",
    warningSoft: "#3A2C16",
    warningText: "#E8B66A",
    neutralSoft: "#26201B",
    neutralText: "#D7C9B0",

    shadow: "rgba(0, 0, 0, 0.4)",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
};

export type ThemeColors = (typeof themes)["light"];
export const colors = themes.light;
