// The two text helpers every card now uses (user, 2026-10-28), for the test harnesses that load a
// screen with its imports stubbed. FitText draws as Text, so a tree reads as it did before, and
// cardName is the real rule: first and last name.
//
// The failed-read screen (user, 2026-10-31): drawn by name, and loadFailure is the real rule, so a
// harness can tell a screen that stops for a failed read from one that goes on.
const refused = (error) => {
  const status = error?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

module.exports = {
  "@/components/load-failed": {
    AppFailureOverlay: "AppFailureOverlay",
    LoadFailed: "LoadFailed",
    LoadFailedCard: "LoadFailedCard",
    LoadFailedScreen: "LoadFailedScreen",
    loadFailure: (...queries) => {
      const failed = queries.filter((query) => query?.isError && query.currentData === undefined && !refused(query.error));
      return failed.length === 0 ? null : { error: failed[0].error, reload: () => failed.forEach((query) => void query.refetch?.()) };
    },
  },
  // The name-below-status row (user, 2026-11-01): drawn as plain Views so a tree reads in source order.
  "@/components/card-name-row": {
    CARD_STATUS_ROW: {},
    CardNameRow: "View",
    CardStatus: "View",
    NAME_UNDER_STATUS: true,
    cardText: (size) => size,
    smallerCardText: (style) => style,
  },
  "@/components/sheet-footer-split": { splitSheetFooter: (children) => ({ body: children, footer: [] }) },
  "@/components/fit-text": { FitText: "Text" },
  // The app's calendar (user, 2026-11-01): drawn by name, with the real date conversions.
  "@/components/calendar-picker": { CalendarPicker: "CalendarPicker" },
  "@/components/calendar-month": {
    dateOfIso: (iso) => { const [year, month, day] = iso.split("-").map(Number); return new Date(year, month - 1, day, 12); },
    isoOfDate: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  },
  "@/lib/person-name": {
    cardName: (name) => {
      const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
      return words.length > 2 ? `${words[0]} ${words[words.length - 1]}` : words.join(" ");
    },
  },
};
