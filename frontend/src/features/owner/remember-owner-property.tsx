import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { resetOwnerWorkspace, restoreSelectedOwnerProperty } from "@/store/slices/owner-workspace-slice";

/** Per signed-in account, so one phone shared by two owners never mixes them up. */
const keyFor = (userId: string) => `khatiyan.owner.lastProperty.${userId}`;

/**
 * The app opens on the property someone last had selected (user, 2026-11-14), not the
 * list's first. Reads it back once per sign-in, and saves every change after that.
 * Renders nothing.
 */
export function RememberOwnerProperty() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const selected = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const restored = useAppSelector((state) => state.ownerWorkspace.restored);

  // A different account (or a sign-out) starts clean, so one person's property never
  // carries over to the next.
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (lastUser.current !== null && lastUser.current !== userId) dispatch(resetOwnerWorkspace());
    lastUser.current = userId;
  }, [dispatch, userId]);

  // Read back once the account is known.
  useEffect(() => {
    if (!userId || restored) return;
    let cancelled = false;
    AsyncStorage.getItem(keyFor(userId))
      .catch(() => null)
      .then((saved) => {
        if (!cancelled) dispatch(restoreSelectedOwnerProperty(saved));
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, restored, userId]);

  // Save each choice, once the remembered one has been read (not before, or the empty
  // starting state would overwrite it).
  useEffect(() => {
    if (!userId || !restored || !selected) return;
    void AsyncStorage.setItem(keyFor(userId), selected).catch(() => undefined);
  }, [restored, selected, userId]);

  return null;
}
