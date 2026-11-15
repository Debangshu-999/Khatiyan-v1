import { api } from "@/store/api";

/** How a mark was made (user, 2026-11-15). WIFI and LOCATION are verified, SELF is the tenant's word. */
export type RollCallMethod = "WIFI" | "LOCATION" | "SELF" | "WARDEN";
/** No mark at all is NOT_MARKED, never ABSENT (user, 2026-11-15). */
export type RollCallState = "PRESENT" | "ABSENT" | "AWAY" | "AWAY_DECLARED" | "NOT_MARKED";

/** The tenant's roll call tonight. */
export type RollCallToday = {
  /** Roll call is on at this property and this stay is on the roll. */
  available: boolean;
  autoCheckIn: boolean;
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  /** The window is open now, so marking is allowed. */
  open: boolean;
  night: string | null;
  state: RollCallState;
  method: RollCallMethod | null;
  markedAt: string | null;
};

/** What the phone saw when the app opened: the router, and failing that where it is. */
export type RollCallCheckIn = {
  bssid: string | null;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  mocked?: boolean;
};

export type RollCallNight = {
  night: string;
  tonight: string;
  enabled: boolean;
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  counts: { present: number; presentVerified: number; presentSelf: number; away: number; notMarked: number; absent: number };
  entries: RollCallEntry[];
};

export type RollCallEntry = {
  tenancyId: string;
  tenancyCode: string | null;
  tenantName: string | null;
  roomNumber: string | null;
  state: RollCallState;
  method: RollCallMethod | null;
  markedAt: string | null;
  /** Who made a warden's mark; shown as "You" when it is the viewer. */
  markedByUserId: string | null;
  markedByName: string | null;
};

export type RollCallSettings = {
  enabled: boolean;
  autoCheckIn: boolean;
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  radiusMeters: number;
  wifi: { id: string; bssid: string; ssid: string | null; addedAt: string }[];
  version: number;
};

export type SaveRollCallSettings = {
  enabled: boolean;
  autoCheckIn: boolean;
  windowStartMinute: number | null;
  windowEndMinute: number | null;
  version: number;
};

/** The warden's own marks, or null to take one off. */
export type WardenStatus = "PRESENT" | "ABSENT" | "AWAY" | null;

export const rollCallApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMyRollCall: builder.query<RollCallToday, void>({
      providesTags: ["RollCall"],
      query: () => "/api/v1/tenancies/me/roll-call",
    }),
    checkInRollCall: builder.mutation<RollCallToday, RollCallCheckIn>({
      // The answer is tonight's state: written straight into the card, no refetch.
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(rollCallApi.util.upsertQueryData("getMyRollCall", undefined, data));
        } catch {
          // The card keeps what it had; a failed check never marks anyone absent.
        }
      },
      query: (body) => ({ body, method: "POST", url: "/api/v1/tenancies/me/roll-call/check-in" }),
    }),
    markRollCallPresent: builder.mutation<RollCallToday, void>({
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(rollCallApi.util.upsertQueryData("getMyRollCall", undefined, data));
        } catch {
          // The screen shows the refusal.
        }
      },
      query: () => ({ method: "POST", url: "/api/v1/tenancies/me/roll-call/mark-present" }),
    }),
    getPropertyRollCall: builder.query<RollCallNight, { propertyId: string; night?: string | null }>({
      providesTags: ["RollCall"],
      query: ({ night, propertyId }) => ({
        params: night ? { night } : {},
        url: `/api/v1/properties/${propertyId}/roll-call`,
      }),
    }),
    setRollCallMark: builder.mutation<RollCallNight, { propertyId: string; tenancyId: string; night: string; status: WardenStatus }>({
      invalidatesTags: ["RollCall"],
      query: ({ night, propertyId, status, tenancyId }) => ({
        body: { night, status },
        method: "PUT",
        url: `/api/v1/properties/${propertyId}/roll-call/marks/${tenancyId}`,
      }),
    }),
    getRollCallSettings: builder.query<RollCallSettings, string>({
      providesTags: ["RollCall"],
      query: (propertyId) => `/api/v1/properties/${propertyId}/roll-call/settings`,
    }),
    saveRollCallSettings: builder.mutation<RollCallSettings, { propertyId: string; body: SaveRollCallSettings }>({
      invalidatesTags: ["RollCall"],
      // The saved settings go straight into the screen's copy (user, 2026-11-15): clearing the
      // edits before the refetch landed showed the old switch for a moment, then the new one.
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(rollCallApi.util.upsertQueryData("getRollCallSettings", arg.propertyId, data));
        } catch {
          // The screen shows the refusal.
        }
      },
      query: ({ body, propertyId }) => ({ body, method: "PUT", url: `/api/v1/properties/${propertyId}/roll-call/settings` }),
    }),
    addRollCallWifi: builder.mutation<RollCallSettings, { propertyId: string; bssid: string; ssid: string | null }>({
      invalidatesTags: ["RollCall"],
      // The saved settings go straight into the screen's copy (user, 2026-11-15): clearing the
      // edits before the refetch landed showed the old switch for a moment, then the new one.
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(rollCallApi.util.upsertQueryData("getRollCallSettings", arg.propertyId, data));
        } catch {
          // The screen shows the refusal.
        }
      },
      query: ({ bssid, propertyId, ssid }) => ({ body: { bssid, ssid }, method: "POST", url: `/api/v1/properties/${propertyId}/roll-call/wifi` }),
    }),
    removeRollCallWifi: builder.mutation<RollCallSettings, { propertyId: string; wifiId: string }>({
      invalidatesTags: ["RollCall"],
      // The saved settings go straight into the screen's copy (user, 2026-11-15): clearing the
      // edits before the refetch landed showed the old switch for a moment, then the new one.
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(rollCallApi.util.upsertQueryData("getRollCallSettings", arg.propertyId, data));
        } catch {
          // The screen shows the refusal.
        }
      },
      query: ({ propertyId, wifiId }) => ({ method: "DELETE", url: `/api/v1/properties/${propertyId}/roll-call/wifi/${wifiId}` }),
    }),
  }),
  // Hot reload re-runs this file: without it the old endpoints stayed and an edit never took (2026-11-15).
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useAddRollCallWifiMutation,
  useCheckInRollCallMutation,
  useGetMyRollCallQuery,
  useGetPropertyRollCallQuery,
  useGetRollCallSettingsQuery,
  useMarkRollCallPresentMutation,
  useRemoveRollCallWifiMutation,
  useSaveRollCallSettingsMutation,
  useSetRollCallMarkMutation,
} = rollCallApi;

/** "9:42 pm" in India, the app's way of writing a time. */
export function rollCallTime(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    .format(new Date(iso))
    .replace(/\s?([ap])\.?m\.?/i, (_m, half: string) => ` ${half.toLowerCase()}m`);
}

/** "9 pm", "10:30 pm" from minutes of the day. */
export function minutesLabel(minutes: number | null) {
  if (minutes == null) return "";
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const half = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${half}` : `${hour12}:${String(minute).padStart(2, "0")} ${half}`;
}
