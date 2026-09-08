import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { defaultApiBaseUrl, normalizeApiBaseUrl, resolveDefaultApiBaseUrl } from "@/config/api";
import type { ThemeMode } from "@/theme/colors";

type AppConfigState = {
  apiBaseUrl: string;
  /**
   * Milliseconds of artificial latency added to every API call, in dev only.
   *
   * <p>
   * There to make loading states reviewable. Real throttling cannot show most
   * of them: RTK Query serves a cached argument set synchronously, so slowing
   * the network only slows a REFETCH — which by design keeps the current screen
   * rather than replacing it with a ghost. A skeleton nobody can make appear is
   * a skeleton nobody maintains.
   *
   * <p>
   * <b>Off by default.</b> It ran at 2s through the skeleton work and is parked
   * rather than deleted — turn it back on for a session with
   * {@code store.dispatch(setSlowNetworkMs(2000))} when reviewing loading
   * states, and reach for it again before trusting any "it feels instant".
   * Two seconds is the value that worked: long enough to read a loading state
   * on every screen, short enough that nobody stops using the app.
   *
   * <p>
   * `api.ts` checks `__DEV__` as well as this value, so a stray non-zero
   * setting cannot reach a release build however the store is rehydrated.
   */
  slowNetworkMs: number;
  themeMode: ThemeMode;
};

const initialState: AppConfigState = {
  apiBaseUrl: defaultApiBaseUrl,
  slowNetworkMs: 0,
  themeMode: "light",
};

const appConfigSlice = createSlice({
  name: "appConfig",
  initialState,
  reducers: {
    setApiBaseUrl(state, action: PayloadAction<string>) {
      // Normalised on the way IN, so what the store holds is always safe to
      // concatenate. A value typed into a dev settings box is exactly where a
      // stray space comes from.
      state.apiBaseUrl = normalizeApiBaseUrl(action.payload);
    },
    resetApiBaseUrl(state) {
      state.apiBaseUrl = resolveDefaultApiBaseUrl();
    },
    setSlowNetworkMs(state, action: PayloadAction<number>) {
      state.slowNetworkMs = Math.max(0, action.payload);
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    toggleThemeMode(state) {
      state.themeMode = state.themeMode === "light" ? "dark" : "light";
    },
  },
});

export const { resetApiBaseUrl, setApiBaseUrl, setSlowNetworkMs, setThemeMode, toggleThemeMode } =
  appConfigSlice.actions;
export const appConfigReducer = appConfigSlice.reducer;
