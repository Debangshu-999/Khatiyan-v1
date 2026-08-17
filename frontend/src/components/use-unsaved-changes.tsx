import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigation } from "expo-router";

import { ConfirmDialog } from "@/features/owner/owner-ui";

/**
 * Guards a form against being left with unsaved edits.
 *
 * <p>Two ways out of a screen, so two hooks into it:
 *
 * <ul>
 *   <li><b>Routed screens</b> — the navigator's `beforeRemove` event. It fires
 *       for every exit that removes the screen: the header back chip, the
 *       Android hardware button, the swipe gesture and any `router.back()`.
 *       Catching them in one place beats guarding each control and missing the
 *       gesture.
 *   <li><b>Modals</b> — they are not in the navigator, so they close through
 *       their own handler. Those wrap it in {@link guard}.
 * </ul>
 *
 * <p>The dialog is rendered by the caller, which keeps this a hook rather than a
 * wrapper component — a form's layout should not have to change to gain a
 * guard.
 */
export function useUnsavedChanges(dirty: boolean) {
  const navigation = useNavigation();
  const [pendingExit, setPendingExit] = useState<(() => void) | null>(null);

  // Read inside the listener, which is registered once — a stale closure here
  // would guard against whatever `dirty` was when the screen mounted.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Set while we replay a navigation the person confirmed, so the listener lets
  // that one through instead of asking again and blocking it forever.
  const confirming = useRef(false);

  useEffect(() => {
    // Present only inside a navigator. Modal-only callers still get `guard`.
    const unsubscribe = navigation.addListener?.("beforeRemove" as never, (event: unknown) => {
      const removal = event as { preventDefault: () => void; data: { action: unknown } };
      if (!dirtyRef.current || confirming.current) {
        return;
      }
      removal.preventDefault();
      setPendingExit(() => () => {
        confirming.current = true;
        navigation.dispatch(removal.data.action as never);
      });
    });

    return unsubscribe;
  }, [navigation]);

  /**
   * Stands the guard down for the exit that follows.
   *
   * <p>A successful save navigates away while the fields still differ from what
   * was loaded — the screen has no reason to re-seed itself on the way out.
   * Without this the form would challenge the person over changes it had just
   * written.
   */
  const markSaved = useCallback(() => {
    confirming.current = true;
  }, []);

  /**
   * Wraps a close handler that navigation cannot see — a modal's ×, a sheet's
   * backdrop. Runs it straight away when there is nothing to lose.
   */
  const guard = useCallback(
    (close: () => void) => {
      if (!dirtyRef.current) {
        close();
        return;
      }
      setPendingExit(() => close);
    },
    [],
  );

  const dialog = pendingExit ? (
    <ConfirmDialog
      confirmLabel="Exit"
      destructive
      message="There are unsaved changes, exit without saving?"
      onCancel={() => setPendingExit(null)}
      onConfirm={() => {
        const exit = pendingExit;
        setPendingExit(null);
        exit();
      }}
      title="Unsaved changes"
    />
  ) : null;

  return { dialog, guard, markSaved };
}
