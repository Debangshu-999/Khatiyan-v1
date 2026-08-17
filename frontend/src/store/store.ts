import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { AppState } from "react-native";

import { api } from "@/store/api";
import { accountReducer } from "@/store/slices/account-slice";
import { appConfigReducer } from "@/store/slices/app-config-slice";
import { authReducer } from "@/store/slices/auth-slice";
import { locationReducer } from "@/store/slices/location-slice";
import { ownerPinsReducer } from "@/store/slices/owner-pins-slice";
import { ownerWorkspaceReducer } from "@/store/slices/owner-workspace-slice";

export const store = configureStore({
  reducer: {
    account: accountReducer,
    appConfig: appConfigReducer,
    auth: authReducer,
    location: locationReducer,
    ownerPins: ownerPinsReducer,
    ownerWorkspace: ownerWorkspaceReducer,
    [api.reducerPath]: api.reducer,
  },
  // The dev-only immutable/serializable checks deep-scan store state on every
  // dispatch. Scanning RTK Query's cache slice — large and machine-managed —
  // visibly delayed navigation on any screen that fetches, while adding no
  // safety: Immer already freezes all state in dev, so direct mutations throw
  // regardless. The checks stay on for the small hand-written slices only.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: { ignoredPaths: [api.reducerPath] },
      serializableCheck: { ignoredPaths: [api.reducerPath] },
    }).concat(api.middleware),
});

// Wire RTK Query's refetchOnFocus/refetchOnReconnect to React Native's
// AppState. The browser focus/visibility events these features rely on do
// not fire in React Native, so we translate app foreground/background into
// onFocus/onFocusLost. This makes `refetchOnFocus` queries (e.g. the
// notification feed and bell badge) refresh when the app returns to the
// foreground instead of showing stale cached data.
setupListeners(store.dispatch, (dispatch, { onFocus, onFocusLost }) => {
  const subscription = AppState.addEventListener("change", (status) => {
    if (status === "active") {
      dispatch(onFocus());
    } else {
      dispatch(onFocusLost());
    }
  });

  return () => subscription.remove();
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
