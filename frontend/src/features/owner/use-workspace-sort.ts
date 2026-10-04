import { useCallback, useEffect, useRef, useState } from "react";

import { loadWorkspaceSortForUser, saveWorkspaceSortForUser } from "@/config/app-settings-storage";
import type { OwnerModuleKey } from "@/features/owner/owner-modules";
import {
  refreshPendingMarks,
  type PendingMarks,
  type WorkspaceSortMode,
} from "@/features/owner/workspace-sort";

type WorkspaceSort = { customOrder: string[]; marks: PendingMarks; mode: WorkspaceSortMode };

const DEFAULT: WorkspaceSort = { customOrder: [], marks: {}, mode: "AZ" };

/**
 * The Manage tab's sort, kept per person on this device (user, 2026-10-04):
 * the mode they chose, the order they dragged the cards into, and for Dynamic,
 * when each module last got something waiting.
 *
 * <p>A to Z until the saved choice has been read, so the cards never jump from
 * one order to another a moment after the tab opens for someone who never
 * changed it. Nothing is saved before then either: an early save would write
 * the default over the stored choice.
 *
 * @param pending what is waiting in each module now, or null while the
 *                dashboard has not answered
 */
export function useWorkspaceSort(
  userId: string | null,
  propertyId: string | null,
  pending: Record<OwnerModuleKey, number> | null,
) {
  const [sort, setSort] = useState<WorkspaceSort>(DEFAULT);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // What storage holds, so a render that changed nothing does not write.
  const saved = useRef<WorkspaceSort>(DEFAULT);

  useEffect(() => {
    let active = true;
    setLoadedFor(null);
    setSort(DEFAULT);
    saved.current = DEFAULT;
    if (!userId) return;
    void loadWorkspaceSortForUser(userId).then((stored) => {
      if (!active) return;
      if (stored) {
        const read = { customOrder: stored.customOrder ?? [], marks: stored.marks ?? {}, mode: stored.mode ?? "AZ" };
        saved.current = read;
        setSort(read);
      }
      setLoadedFor(userId);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const ready = userId !== null && loadedFor === userId;

  useEffect(() => {
    if (!ready || !userId || sort === saved.current) return;
    saved.current = sort;
    void saveWorkspaceSortForUser(userId, sort);
  }, [ready, sort, userId]);

  // Each fresh look at the dashboard: stamp whatever has just got more waiting.
  // The signature stands in for `pending`, which is a new object every render.
  const pendingSignature = pending ? JSON.stringify(pending) : null;
  useEffect(() => {
    if (!ready || !propertyId || !pendingSignature) return;
    const counts = JSON.parse(pendingSignature) as Record<OwnerModuleKey, number>;
    const now = Date.now();
    setSort((current) => {
      const marks = refreshPendingMarks(current.marks, propertyId, counts, now);
      return marks === current.marks ? current : { ...current, marks };
    });
  }, [pendingSignature, propertyId, ready]);

  const setMode = useCallback((mode: WorkspaceSortMode, shownOrder: string[]) => {
    setSort((current) => ({
      ...current,
      // Custom starts from the order on screen, the first time it is chosen.
      customOrder: mode === "CUSTOM" && current.customOrder.length === 0 ? shownOrder : current.customOrder,
      mode,
    }));
  }, []);

  const setCustomOrder = useCallback((customOrder: string[]) => {
    setSort((current) => ({ ...current, customOrder }));
  }, []);

  return { ...sort, setCustomOrder, setMode };
}
