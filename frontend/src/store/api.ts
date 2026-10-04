import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { deviceLabel, devicePlatform } from "@/auth/device-identity";
import { clearWalletAccess, walletAccessToken } from "@/auth/wallet-access";
import { checkResponseShape } from "@/store/response-guards";
import { sessionExpired } from "@/store/slices/auth-slice";
import { noteStaleRefusal } from "@/store/stale-refusal";
import type { RootState } from "@/store/store";

/**
 * Failures that are an ANSWER, not a fault.
 *
 * <p>An owner asking for their own tenancy is told 403 because they are not a
 * tenant, and that is the correct reply — the tab asks on every load and gets
 * it every time. Logging it trained us to scroll past this warning, which is
 * the opposite of what it is for: a log nobody reads cannot tell you when
 * something real breaks.
 *
 * <p>Deliberately per endpoint and per status. A blanket "ignore 403" would
 * hide every genuine permission bug in the app.
 */
const EXPECTED_FAILURES: Record<string, number[]> = {
  getMyActiveTenancy: [403, 404],
};

function isExpectedFailure(endpoint: string, status: unknown) {
  return typeof status === "number" && (EXPECTED_FAILURES[endpoint] ?? []).includes(status);
}

/**
 * Every cache tag, named once so a conflict can throw all of them away
 * (2026-09-28, see STALE below).
 */
export const API_TAGS = [
  "Profile",
  "Property",
  // Its own tag, so saving visit slots does not refetch every property read.
  "PropertyVisits",
  "Tenancy",
  "BillingCycle",
  "Concern",
  "Notice",
  "Notification",
  "Discovery",
  "Payment",
  "Deposit",
  "Staff",
  "Expense",
  "Pnl",
  "Payout",
  "Compliance",
  "Nudge",
  // Separate from "Nudge" so reading the tenant's list can refresh the badge
  // without invalidating the list it just fetched.
  "NudgeUnread",
  "PaymentIntent",
  // Separate from "PaymentIntent" so an owner saving their UPI address does
  // not invalidate the claims queue, and vice versa.
  "PaymentDetails",
  "Enquiry",
  // Separate from "Enquiry" so the consent modal saving does not invalidate
  // the property's enquiry list on a screen the enquirer cannot even see.
  "EnquiryConsent",
  // The action bar of an enquiry's chat and the visit slots behind it.
  // Separate from "Enquiry" so booking a visit does not refetch the
  // property's whole enquiry list.
  "EnquiryChat",
  "Session",
  // The tenant's own identity checks. Separate from "Tenancy" so completing
  // a check refreshes the step bar without refetching the whole agreement
  // the tenant is part way through reading.
  "Verification",
  // The owner's prepaid balance. Its own tag rather than riding on "Payment":
  // that one belongs to the parked rent-collection module, and a top-up has
  // nothing to do with a tenant paying rent.
  "ServiceBalance",
  "Chat",
  // Separate from "Chat" so opening a conversation can clear the tab badge
  // without invalidating the thread list it is already showing.
  "ChatUnread",
  // Property food catalogue, profiles, menus, subscriptions and forecasts.
  // Separate from Property so editing a menu does not refetch rooms and
  // listing details across the workspace.
  "Food",
  // One day's cooking forecast. Separate from "Food" because the forecast is
  // DERIVED — from menus, profiles and subscriptions — so re-deriving it on
  // every unrelated food edit would refetch a heavy read while an owner is
  // typing a quantity. Only the two things that change a single date's
  // cooking, marking an item unavailable and putting it back, invalidate it.
  "FoodForecast",
  // Owner analytics. Nothing invalidates it in v1: pull to refresh refetches.
  "Analytics",
] as const;

/**
 * The If-Match header for an action on an existing record (2026-09-29): the
 * version the screen loaded. The server refuses a changed record with 409 STALE
 * and a missing version with 428.
 */
export function ifMatch(version: number): Record<string, string> {
  return { "If-Match": String(version) };
}

/**
 * The server's answer when someone else changed a record since this screen
 * loaded it, or saved it at the same moment (2026-09-28).
 */
function isStaleConflict(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { code?: unknown }).code === "STALE";
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: async (args, apiContext, extraOptions) => {
    const state = apiContext.getState() as RootState;
    // Read before the request: by the time it returns, another failing call may
    // already have cleared the token, and this one would then look like an
    // unauthenticated request that was always going to 401.
    const hadToken = Boolean(state.auth.accessToken);
    const rawBaseUrl = state.appConfig.apiBaseUrl.trim();
    const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
    const baseQuery = fetchBaseQuery({
      baseUrl,
      // Without this a request has no deadline at all. A refused connection
      // fails fast, so a stopped backend was never the problem — but a backend
      // that accepts the socket and never answers (hung, deadlocked, or simply
      // the wrong LAN IP where packets are dropped rather than rejected) leaves
      // the request hanging on the OS TCP timeout, which is minutes on Android.
      // The user sees a spinner that never resolves and no way to tell why.
      // 20s is well past a slow mobile round trip and well short of that.
      timeout: 20_000,
      prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).auth.accessToken;
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        const walletToken = walletAccessToken(token);
        if (walletToken && ["listServiceBalanceEntries", "startServiceBalanceTopUp", "getServiceBalanceTopUp"].includes(apiContext.endpoint)) headers.set("X-Wallet-Unlock", walletToken);
        // Names this device in the signed-in devices list. Sent on every request
        // rather than only on sign-in: a token is minted by six endpoints, and
        // the server records a session from whichever one was used.
        headers.set("X-Device-Label", deviceLabel());
        headers.set("X-Device-Platform", devicePlatform());
        return headers;
      },
    });

    // Dev-only artificial latency, so every loading state can be walked
    // without a proxy. __DEV__ is checked as well as the value, so a stray
    // non-zero setting could never reach a release build.
    if (__DEV__ && state.appConfig.slowNetworkMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.appConfig.slowNetworkMs));
    }

    const result = await baseQuery(args, apiContext, extraOptions);
    if (result.error?.status === 403 && (result.error.data as { code?: string } | undefined)?.code === "WALLET_LOCKED") clearWalletAccess();

    // Dev-only: a failed read otherwise leaves no trace at all. Screens that
    // render nothing when a query fails look exactly like screens whose data is
    // legitimately empty, and telling those apart used to need a proxy.
    if (__DEV__ && result.error && !isExpectedFailure(apiContext.endpoint, result.error.status)) {
      const detail =
        typeof result.error.data === "string"
          ? result.error.data
          : JSON.stringify(result.error.data ?? null);
      // The endpoint and the server's own words, but never the request body —
      // these payloads carry tenant names, phone numbers and addresses, and a
      // terminal is not the place for them.
      console.warn(`[api] ${apiContext.endpoint} failed ${String(result.error.status)} ${detail?.slice(0, 300)}`);
    }

    // A token we were holding has been refused — expired, or invalidated by a
    // PIN change on another device. Caught here because every request passes
    // through this one function; screens used to each render their own empty
    // state instead, so an expired session looked like a page with no data
    // until a pull-to-refresh happened to bounce someone to sign-in.
    //
    // `hadToken` is the whole guard: a 401 from the sign-in endpoints means a
    // wrong PIN, not a dead session, and announcing "your session expired" to
    // someone who is not signed in would be nonsense.
    if (result.error?.status === 401 && hadToken) {
      apiContext.dispatch(sessionExpired());
    }

    // Someone else changed this since the screen loaded it (2026-09-28). Every
    // cached read is thrown away, so each screen on show refetches the latest,
    // and the caller shows the server's message in its usual refusal dialog.
    // The message is noted, so that dialog knows to leave the form or sheet it
    // was raised in once it is closed (2026-10-04).
    if (result.error?.status === 409 && isStaleConflict(result.error.data)) {
      apiContext.dispatch(api.util.invalidateTags([...API_TAGS]));
      const message = (result.error.data as { message?: unknown }).message;
      if (typeof message === "string") {
        noteStaleRefusal(message);
      }
    }

    // Verify what actually arrived against the shape the client claims. Dev-only
    // and warn-only — see response-guards for why.
    if (result.data !== undefined) {
      checkResponseShape(apiContext.endpoint, result.data);
    }

    return result;
  },
  endpoints: () => ({}),
  tagTypes: API_TAGS,
});
