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
  /**
   * Set when the server rejected a token we were holding.
   *
   * <p>Separate from simply having no token, because the two need different
   * treatment: an absent token is someone who has not signed in, while this is
   * someone who WAS signed in and is now looking at a screen of stale data. It
   * is what the app reacts to in order to say so and send them back to sign in,
   * and it is cleared once that has been shown.
   */
  sessionExpired: boolean;
};

type SessionPayload = Pick<AuthState, "accessToken" | "user">;

const initialState: AuthState = {
  accessToken: null,
  hydrated: false,
  registeredDeviceTokenId: null,
  sessionExpired: false,
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
      state.sessionExpired = false;
    },
    clearSession(state) {
      state.accessToken = null;
      state.registeredDeviceTokenId = null;
      state.sessionExpired = false;
      state.user = null;
    },
    /**
     * The server refused a token we were holding.
     *
     * <p>Credentials are dropped here rather than on the way out of the app, so
     * no further request goes out carrying a token already known to be dead.
     */
    sessionExpired(state) {
      state.accessToken = null;
      state.registeredDeviceTokenId = null;
      state.user = null;
      state.sessionExpired = true;
    },
    /** Called once the expiry has been shown, so it cannot announce twice. */
    sessionExpiryAcknowledged(state) {
      state.sessionExpired = false;
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
  sessionExpired,
  sessionExpiryAcknowledged,
  setRegisteredDeviceTokenId,
  setSession,
} = authSlice.actions;
export const authReducer = authSlice.reducer;
