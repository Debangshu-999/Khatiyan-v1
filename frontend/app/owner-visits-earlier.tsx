import { VisitsScreen } from "./owner-visits";

/**
 * Earlier today (user, 2026-10-04): the visits of today's slots that have
 * ended, opened from the card at the foot of Manage Visits. The same cards and
 * the same sheets as that screen, so it is that screen in its other view.
 */
export default function OwnerVisitsEarlierScreen() {
  return <VisitsScreen view="earlier" />;
}
