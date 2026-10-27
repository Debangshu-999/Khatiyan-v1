import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { newId, track } from "@/features/analytics/tracker";
import type { AppEvent } from "@/store/services/app-events-api";

export type ProfileSource = NonNullable<AppEvent["source"]>;

/** The profile on screen now, so a contact tap on it is tied to its view. */
let currentView: { propertyId: string; viewId: string } | null = null;

/**
 * Records one view of a property profile (2026-10-18): an open when it comes on
 * screen, a close with the time spent when it goes.
 *
 * <p>Only time with the profile actually in front counts. The clock stops when
 * the app goes to the background or the screen loses focus, so a phone left
 * locked on a profile does not read as an hour of interest.
 *
 * @param propertyId the profile shown, null when none is
 * @param focused    whether the screen holding the profile is the one in front
 */
export function useProfileView(propertyId: string | null, source: ProfileSource, focused: boolean) {
  const view = useRef<{ propertyId: string; viewId: string; shownMs: number; since: number | null } | null>(null);

  // A new profile ends the last view and starts the next.
  useEffect(() => {
    if (!propertyId) {
      return;
    }
    const started = { propertyId, shownMs: 0, since: Date.now(), viewId: newId() };
    view.current = started;
    currentView = { propertyId, viewId: started.viewId };
    track({ name: "PROFILE_OPENED", propertyId, source, viewId: started.viewId });
    return () => {
      const shownMs = started.shownMs + (started.since == null ? 0 : Date.now() - started.since);
      track({ durationMs: Math.max(0, Math.round(shownMs)), name: "PROFILE_CLOSED", propertyId, viewId: started.viewId });
      if (currentView?.viewId === started.viewId) {
        currentView = null;
      }
      view.current = null;
    };
    // The source belongs to the open. A change of source alone is not a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Pause the clock while the screen is not in front.
  useEffect(() => {
    const current = view.current;
    if (!current) {
      return;
    }
    if (focused && current.since == null) {
      current.since = Date.now();
    } else if (!focused && current.since != null) {
      current.shownMs += Date.now() - current.since;
      current.since = null;
    }
  }, [focused, propertyId]);

  // And while the app is in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const current = view.current;
      if (!current) {
        return;
      }
      if (state === "active" && current.since == null && focused) {
        current.since = Date.now();
      } else if (state !== "active" && current.since != null) {
        current.shownMs += Date.now() - current.since;
        current.since = null;
      }
    });
    return () => subscription.remove();
  }, [focused]);
}

/** A call tapped on the profile on screen. Profiles show no email (2026-10-18). */
export function trackContactTap(channel: "CALL") {
  if (currentView) {
    track({ channel, name: "CONTACT_TAPPED", propertyId: currentView.propertyId, viewId: currentView.viewId });
  }
}
