import { api } from "@/store/api";

// Notification queries must never serve a stale snapshot: server-side
// notification creation (a scheduler, or another user's action) never
// invalidates this client's cache, so the only way to see the newest items
// is to refetch whenever the user looks. Apply these to every notification
// query hook so opening the screen, returning to the app, or reconnecting
// always pulls fresh data. Scoped here (rather than globally on createApi)
// so unrelated screens like discovery keep their normal cache behavior.
export const NOTIFICATION_REFETCH_OPTIONS = {
  refetchOnMountOrArgChange: true,
  refetchOnFocus: true,
  refetchOnReconnect: true,
} as const;

export type NotificationItem = {
  recipientId: string;
  notificationId: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  subtype: string | null;
  sourceId: string | null;
  data: Record<string, string>;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type DevicePlatform = "ANDROID" | "IOS" | "WEB";
export type PushProvider = "ONESIGNAL" | "FIREBASE" | "LOG";

export type DeviceTokenResponse = {
  id: string;
  provider: PushProvider;
  platform: DevicePlatform;
  active: boolean;
  lastSeenAt: string;
};

export type RegisterDeviceRequest = {
  provider: PushProvider;
  providerToken: string;
  platform: DevicePlatform;
};

// Feed queries are scoped to the active account (tenant vs manager/owner) so a
// multi-role user sees a separated inbox. Account may be null before one is
// chosen — the backend then falls back to role-based scoping.
type FeedAccount = string | null | undefined;

function feedUrl(path: string, account: FeedAccount) {
  return account ? `${path}?account=${encodeURIComponent(account)}` : path;
}

export const notificationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRecentNotifications: builder.query<NotificationItem[], FeedAccount>({
      query: (account) => feedUrl("/api/v1/notifications/me/feed/recent", account),
      providesTags: ["Notification"],
    }),

    getOlderNotifications: builder.query<NotificationItem[], FeedAccount>({
      query: (account) => feedUrl("/api/v1/notifications/me/feed/older", account),
      providesTags: ["Notification"],
    }),

    getUnreadNotificationCount: builder.query<number, FeedAccount>({
      query: (account) => feedUrl("/api/v1/notifications/me/feed/unread-count", account),
      providesTags: ["Notification"],
    }),

    markNotificationRead: builder.mutation<NotificationItem, string>({
      query: (recipientId) => ({
        url: `/api/v1/notifications/${recipientId}/read`,
        method: "PATCH",
      }),
      invalidatesTags: ["Notification"],
    }),

    markAllNotificationsRead: builder.mutation<void, FeedAccount>({
      query: (account) => ({
        url: feedUrl("/api/v1/notifications/me/read-all", account),
        method: "PATCH",
      }),
      invalidatesTags: ["Notification"],
    }),

    registerDevice: builder.mutation<DeviceTokenResponse, RegisterDeviceRequest>({
      query: (body) => ({
        url: "/api/v1/notifications/devices",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Notification"],
    }),

    listMyDevices: builder.query<DeviceTokenResponse[], void>({
      query: () => "/api/v1/notifications/devices",
      providesTags: ["Notification"],
    }),

    deactivateDevice: builder.mutation<void, string>({
      query: (tokenId) => ({
        url: `/api/v1/notifications/devices/${tokenId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Notification"],
    }),
  }),
});

export const {
  useDeactivateDeviceMutation,
  useGetOlderNotificationsQuery,
  useGetRecentNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useListMyDevicesQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useRegisterDeviceMutation,
} = notificationApi;
