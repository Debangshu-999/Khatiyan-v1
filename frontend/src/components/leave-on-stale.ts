import { useEffect, useRef } from "react";

/**
 * Leaving the form or sheet a "data has changed" refusal was raised in (user,
 * 2026-10-04).
 *
 * <p>The server refuses an action on a record someone else changed first, and
 * every screen then refetches. The user used to be left where they were. On a
 * list that is right: it simply shows the latest. On a form it is not: the
 * form still holds what was typed against the old record, and the refetch has
 * handed it the new version, so pressing Save again would write those old
 * values over the other person's change. So once the refusal is closed:
 *
 * <ul>
 * <li>a sheet closes, to be opened again on the new data;</li>
 * <li>a form screen goes back one screen;</li>
 * <li>a list or detail screen stays put.</li>
 * </ul>
 *
 * <p>A registry rather than React context, because the refusal dialog is as
 * often drawn beside its sheet as inside it, and context only reaches down.
 * The sheet on top when the refusal arrives is the one the action came from. A
 * caller that closes its sheet before showing the refusal has already left.
 */
const surfaces: { leave: () => void }[] = [];

/** Registers a sheet or form dialog as something a stale refusal closes. For as long as it is mounted. */
export function useLeavableSurface(leave: () => void) {
  // Read through a ref, so the latest close is the one called.
  const latest = useRef(leave);
  latest.current = leave;
  useEffect(() => {
    const surface = { leave: () => latest.current() };
    surfaces.push(surface);
    return () => {
      const at = surfaces.indexOf(surface);
      if (at >= 0) surfaces.splice(at, 1);
    };
  }, []);
}

/**
 * Closes the sheet on top, if one is open.
 *
 * @return true when there was one to close
 */
export function leaveTopSurface() {
  const top = surfaces[surfaces.length - 1];
  if (!top) return false;
  top.leave();
  return true;
}

/**
 * The screens that are one form with one Save, by route. A stale refusal on
 * one of these goes back a screen. Add a screen here when it is built that way:
 * its fields are filled from the record once, on opening, and saved together.
 * Lists and detail screens, whose actions live on cards and in sheets, are
 * left out on purpose.
 */
export const FORM_ROUTES: ReadonlySet<string> = new Set([
  "/owner-edit-property",
  "/owner-edit-room",
  "/owner-end-tenancy",
  "/owner-exit-policies",
  "/owner-manager-permissions",
  "/owner-payment-details",
  "/owner-property-visits",
  "/owner-tenancy-agreement",
]);
