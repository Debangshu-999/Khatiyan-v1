import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { defaultApiBaseUrl, normalizeApiBaseUrl, resolveDefaultApiBaseUrl } from "@/config/api";
import type { ThemeMode } from "@/theme/colors";

type AppConfigState = {
  apiBaseUrl: string;
  themeMode: ThemeMode;
};

const initialState: AppConfigState = {
  apiBaseUrl: defaultApiBaseUrl,
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
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    toggleThemeMode(state) {
      state.themeMode = state.themeMode === "light" ? "dark" : "light";
    },
  },
});

export const { resetApiBaseUrl, setApiBaseUrl, setThemeMode, toggleThemeMode } = appConfigSlice.actions;
export const appConfigReducer = appConfigSlice.reducer;
