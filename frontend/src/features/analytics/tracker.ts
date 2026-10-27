import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import { store } from "@/store/store";
import { appEventsApi, type AppEvent } from "@/store/services/app-events-api";

/**
 * The app's event tracker (2026-10-18), built the way the common analytics
 * SDKs are:
 *
 * <ul>
 *   <li>Events go into a queue kept on the phone, so a close sent as the app
 *       is being killed is sent on the next launch, not lost.</li>
 *   <li>The queue is sent in batches: every 15 seconds, at 20 events, or the
 *       moment the app goes to the background. Never one request per tap.</li>
 *   <li>A failed send waits longer each time, with a little randomness so many
 *       phones do not retry together, up to a cap.</li>
 *   <li>Every event has its own id, so the server ignores one sent twice.</li>
 *   <li>The queue is capped. In a long outage the oldest events go first.</li>
 * </ul>
 *
 * <p>Only signed-in people are tracked: everyone browsing is. Nothing is sent
 * without a session, and the queue waits for one.
 */

const STORAGE_KEY = "khatiyan.tracker.queue.v1";
const FLUSH_EVERY_MS = 15_000;
const FLUSH_AT = 20;
const BATCH_SIZE = 50;
const MAX_QUEUED = 1_000;
const MAX_BACKOFF_MS = 5 * 60_000;

let queue: AppEvent[] = [];
let loaded = false;
let flushing = false;
let failures = 0;
let retryAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** A random v4 UUID. Event ids only need to be unique, not secret. */
export function newId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/** Queues one event. Never throws: tracking must not break the screen it watches. */
export function track(event: Omit<AppEvent, "eventId" | "schemaVersion" | "occurredAt">) {
  try {
    start();
    queue.push({ ...event, eventId: newId(), occurredAt: new Date().toISOString(), schemaVersion: 1 });
    if (queue.length > MAX_QUEUED) {
      queue = queue.slice(queue.length - MAX_QUEUED);
    }
    void persist();
    if (queue.length >= FLUSH_AT) {
      void flush();
    }
  } catch {
    // A tracker that fails says nothing to the person using the app.
  }
}

/** Sends what is queued, a batch at a time, unless a send is already going or backing off. */
export async function flush() {
  if (flushing || queue.length === 0 || Date.now() < retryAt || !store.getState().auth.accessToken) {
    return;
  }
  flushing = true;
  try {
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH_SIZE);
      await store
        .dispatch(appEventsApi.endpoints.sendAppEvents.initiate({
          context: { appVersion: Constants.expoConfig?.version ?? null, platform: Platform.OS },
          events: batch,
          sentAt: new Date().toISOString(),
        }))
        .unwrap();
      // Accepted, repeated or set aside on the server: each of these is done with.
      const sent = new Set(batch.map((event) => event.eventId));
      queue = queue.filter((event) => !sent.has(event.eventId));
      await persist();
      failures = 0;
      retryAt = 0;
    }
  } catch {
    failures += 1;
    const backoff = Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** (failures - 1));
    retryAt = Date.now() + backoff / 2 + Math.random() * (backoff / 2);
  } finally {
    flushing = false;
  }
}

/** Loads what an earlier run left unsent, then starts the timer and the background flush. Once. */
function start() {
  if (timer) {
    return;
  }
  timer = setInterval(() => void flush(), FLUSH_EVERY_MS);
  AppState.addEventListener("change", (state) => {
    if (state !== "active") {
      void flush();
    }
  });
  if (!loaded) {
    loaded = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const earlier = saved ? (JSON.parse(saved) as AppEvent[]) : [];
        // Anything queued since launch goes after what was already waiting.
        const queuedNow = new Set(queue.map((event) => event.eventId));
        queue = [...earlier.filter((event) => !queuedNow.has(event.eventId)), ...queue].slice(-MAX_QUEUED);
        void flush();
      })
      .catch(() => {
        // An unreadable queue is dropped rather than retried forever.
      });
  }
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Full storage loses only the queue's copy. The events are still in memory.
  }
}

/** Starts the tracker on launch, so last run's unsent events go out. */
export function startTracker() {
  start();
}
