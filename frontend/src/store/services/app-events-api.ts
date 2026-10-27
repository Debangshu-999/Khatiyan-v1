import { api } from "@/store/api";

/** One event as the tracker sends it (2026-10-18). See `@/features/analytics/tracker`. */
export type AppEvent = {
  eventId: string;
  name: "PROFILE_OPENED" | "PROFILE_CLOSED" | "CONTACT_TAPPED";
  schemaVersion: 1;
  occurredAt: string;
  propertyId: string;
  viewId: string;
  source?: "SEARCH" | "SMART_SEARCH" | "MAP" | "LINK" | "OTHER";
  durationMs?: number;
  channel?: "CALL";
};

export type AppEventBatch = {
  sentAt: string;
  context: { appVersion: string | null; platform: string };
  events: AppEvent[];
};

export const appEventsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /** The tracker's batches. Nothing reads a cache of this, so it provides and invalidates nothing. */
    sendAppEvents: builder.mutation<{ accepted: number; rejected: number }, AppEventBatch>({
      query: (batch) => ({ body: batch, method: "POST", url: "/api/v1/app-events" }),
    }),
  }),
  overrideExisting: __DEV__ ? true : "throw",
});
