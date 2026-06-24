export type ThemeMode = "light" | "dark";

// Khatiyan Neutral: white-first surfaces with blue reserved for actions,
// selected states, and small accents.
export const themes = {
  light: {
    background: "#FAFAFB",
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

    danger: "#DC2626",
    dangerSoft: "#FEF2F2",

    successSoft: "#ECFDF5",
    successText: "#047857",
    warningSoft: "#FFFBEB",
    warningText: "#B45309",
    neutralSoft: "#F1F5F9",
    neutralText: "#334155",

    shadow: "rgba(15, 23, 42, 0.08)",
    overlay: "rgba(15, 23, 42, 0.45)",
  },
  dark: {
    background: "#050505",
    surface: "#101010",
    surfaceRaised: "#171717",
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

    danger: "#F87171",
    dangerSoft: "#3B1118",

    successSoft: "#0B2A20",
    successText: "#34D399",
    warningSoft: "#221A08",
    warningText: "#FBBF24",
    neutralSoft: "#1C1C1C",
    neutralText: "#D4D4D4",

    shadow: "rgba(0, 0, 0, 0.42)",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
};

export type ThemeColors = (typeof themes)["light"];
export const colors = themes.light;
