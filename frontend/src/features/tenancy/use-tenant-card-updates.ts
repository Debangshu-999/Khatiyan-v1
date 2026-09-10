import { useCallback, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type TrackedItem = {
  id: string;
  status: string;
};

type Snapshot = Record<string, string>;

type StoredSnapshots = {
  bills?: Snapshot;
  concerns?: Snapshot;
  requests?: Snapshot;
};

type TrackerInput = {
  bills: TrackedItem[];
  billsReady: boolean;
  concerns: TrackedItem[];
  concernsReady: boolean;
  requests: TrackedItem[];
  requestsReady: boolean;
  scopeKey: string | null;
};

const STORAGE_PREFIX = "khatiyan.tenant-card-updates.v1.";

function snapshotOf(items: TrackedItem[]): Snapshot {
  return items.reduce<Snapshot>((snapshot, item) => {
    snapshot[item.id] = item.status;
    return snapshot;
  }, {});
}

function hasBillUpdate(previous: Snapshot, current: Snapshot) {
  return Object.entries(current).some(([id, status]) => previous[id] === undefined || previous[id] !== status);
}

function hasLifecycleUpdate(previous: Snapshot, current: Snapshot) {
  return Object.entries(current).some(
    ([id, status]) => previous[id] !== undefined && previous[id] !== status,
  );
}

async function loadSnapshots(storageKey: string): Promise<StoredSnapshots> {
  const serialized =
    Platform.OS === "web"
      ? window.localStorage.getItem(storageKey)
      : await SecureStore.getItemAsync(storageKey);

  if (!serialized) return {};

  try {
    return JSON.parse(serialized) as StoredSnapshots;
  } catch {
    return {};
  }
}

async function saveSnapshots(storageKey: string, snapshots: StoredSnapshots) {
  const serialized = JSON.stringify(snapshots);
  if (Platform.OS === "web") {
    window.localStorage.setItem(storageKey, serialized);
    return;
  }
  await SecureStore.setItemAsync(storageKey, serialized);
}

export function useTenantCardUpdates({
  bills,
  billsReady,
  concerns,
  concernsReady,
  requests,
  requestsReady,
  scopeKey,
}: TrackerInput) {
  const storageKey = scopeKey ? STORAGE_PREFIX + scopeKey : null;
  const [stored, setStored] = useState<StoredSnapshots | null>(null);
  const [billUpdate, setBillUpdate] = useState(false);
  const [concernUpdate, setConcernUpdate] = useState(false);
  const [requestUpdate, setRequestUpdate] = useState(false);

  const billSnapshot = useMemo(() => snapshotOf(bills), [bills]);
  const concernSnapshot = useMemo(() => snapshotOf(concerns), [concerns]);
  const requestSnapshot = useMemo(() => snapshotOf(requests), [requests]);

  useEffect(() => {
    let cancelled = false;
    setStored(null);
    setBillUpdate(false);
    setConcernUpdate(false);
    setRequestUpdate(false);

    if (!storageKey) return () => undefined;

    void loadSnapshots(storageKey).then((snapshots) => {
      if (!cancelled) setStored(snapshots);
    });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !stored) return;

    const next = { ...stored };
    let initialized = false;

    if (billsReady) {
      if (stored.bills === undefined) {
        next.bills = billSnapshot;
        initialized = true;
        setBillUpdate(false);
      } else {
        setBillUpdate(hasBillUpdate(stored.bills, billSnapshot));
      }
    }

    if (requestsReady) {
      if (stored.requests === undefined) {
        next.requests = requestSnapshot;
        initialized = true;
        setRequestUpdate(false);
      } else {
        setRequestUpdate(hasLifecycleUpdate(stored.requests, requestSnapshot));
      }
    }

    if (concernsReady) {
      if (stored.concerns === undefined) {
        next.concerns = concernSnapshot;
        initialized = true;
        setConcernUpdate(false);
      } else {
        setConcernUpdate(hasLifecycleUpdate(stored.concerns, concernSnapshot));
      }
    }

    if (initialized) {
      setStored(next);
      void saveSnapshots(storageKey, next);
    }
  }, [
    billSnapshot,
    billsReady,
    concernSnapshot,
    concernsReady,
    requestSnapshot,
    requestsReady,
    storageKey,
    stored,
  ]);

  const markSeen = useCallback(
    (kind: keyof StoredSnapshots, snapshot: Snapshot) => {
      if (!storageKey) return;
      setStored((current) => {
        const next = { ...(current ?? {}), [kind]: snapshot };
        void saveSnapshots(storageKey, next);
        return next;
      });
      if (kind === "bills") setBillUpdate(false);
      if (kind === "requests") setRequestUpdate(false);
      if (kind === "concerns") setConcernUpdate(false);
    },
    [storageKey],
  );

  return {
    billUpdate,
    concernUpdate,
    markBillsSeen: useCallback(() => markSeen("bills", billSnapshot), [billSnapshot, markSeen]),
    markConcernsSeen: useCallback(
      () => markSeen("concerns", concernSnapshot),
      [concernSnapshot, markSeen],
    ),
    markRequestsSeen: useCallback(
      () => markSeen("requests", requestSnapshot),
      [markSeen, requestSnapshot],
    ),
    requestUpdate,
  };
}
