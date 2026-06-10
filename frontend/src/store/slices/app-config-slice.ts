import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { defaultApiBaseUrl, resolveDefaultApiBaseUrl } from "@/config/api";
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
      state.apiBaseUrl = action.payload;
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
