import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type AuthUser = {
  id: string;
  referenceCode?: string;
  phone: string;
  fullName: string;
  // Optional because the backend omits null fields entirely, so an absent photo
  // arrives as undefined rather than null.
  profilePhotoUrl?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  role: "USER" | "OWNER" | "TENANT";
  activeTenant: boolean;
  active?: boolean;
  phoneVerified?: boolean;
  profileCompleted?: boolean;
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  // ID of the device token registered in this session — stored so sign-out
  // can deactivate the row before clearing credentials.
  registeredDeviceTokenId: string | null;
};

type SessionPayload = Pick<AuthState, "accessToken" | "user">;

const initialState: AuthState = {
  accessToken: null,
  hydrated: false,
  registeredDeviceTokenId: null,
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<SessionPayload>) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.registeredDeviceTokenId = null;
    },
    clearSession(state) {
      state.accessToken = null;
      state.registeredDeviceTokenId = null;
      state.user = null;
    },
    markSessionHydrated(state) {
      state.hydrated = true;
    },
    setRegisteredDeviceTokenId(state, action: PayloadAction<string | null>) {
      state.registeredDeviceTokenId = action.payload;
    },
  },
});

export const {
  clearSession,
  markSessionHydrated,
  setRegisteredDeviceTokenId,
  setSession,
} = authSlice.actions;
export const authReducer = authSlice.reducer;
