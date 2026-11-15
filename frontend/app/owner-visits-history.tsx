import { VisitsScreen } from "./owner-visits";

/**
 * Visit history (user, 2026-11-14): past visits and cancellations, opened from
 * the History card beside Record external visit on Manage Visits. It was that
 * screen's fourth tab. The same cards, filter and sheets, so it is that screen
 * in another view.
 */
export default function OwnerVisitsHistoryScreen() {
  return <VisitsScreen view="history" />;
}
