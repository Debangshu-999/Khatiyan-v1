import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AccountType } from "@/features/account/accounts";

type AccountState = {
  // Which workspace the phone is currently acting in. Null until chosen /
  // hydrated; a multi-account phone shows a picker while this is null.
  activeAccount: AccountType | null;
};

const initialState: AccountState = {
  activeAccount: null,
};

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    setActiveAccount(state, action: PayloadAction<AccountType | null>) {
      state.activeAccount = action.payload;
    },
    clearActiveAccount(state) {
      state.activeAccount = null;
    },
  },
});

export const { clearActiveAccount, setActiveAccount } = accountSlice.actions;
export const accountReducer = accountSlice.reducer;
