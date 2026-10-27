import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AgreementDeed } from "@/store/services/compliance-api";
import { clearSession, sessionExpired, setSession } from "./auth-slice";
import { clearActiveAccount, setActiveAccount } from "./account-slice";

// In memory only: the unsaved document never goes in a URL or device storage.
const initialState: { document: AgreementDeed | null } = { document: null };
const slice = createSlice({
  name: "agreementPreview",
  initialState,
  reducers: {
    showAgreementPreview(state, action: PayloadAction<AgreementDeed>) {
      state.document = action.payload;
    },
    clearAgreementPreview: () => initialState,
  },
  extraReducers: (builder) => {
    for (const action of [clearSession, sessionExpired, setSession, clearActiveAccount, setActiveAccount]) {
      builder.addCase(action.type, () => initialState);
    }
  },
});

export const { showAgreementPreview, clearAgreementPreview } = slice.actions;
export const agreementPreviewReducer = slice.reducer;
