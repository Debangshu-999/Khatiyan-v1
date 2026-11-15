import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as Location from "expo-location";

import { resolveCurrentLocationAddress } from "./location-address";

export type DeviceLocationState = {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  displayAddress: string | null;
  district: string | null;
  locality: string | null;
  pincode: string | null;
  searchHint: string;
  state: string | null;
  error: string | null;
  status: "idle" | "loading" | "ready" | "error";
};

const initialState: DeviceLocationState = {
  city: null,
  country: null,
  countryCode: null,
  displayAddress: null,
  district: null,
  error: null,
  latitude: null,
  locality: null,
  longitude: null,
  pincode: null,
  searchHint: "",
  state: null,
  status: "idle",
};

/**
 * What the location bar may say when the lookup fails (user, 2026-11-14): never the
 * error's own words, which on a phone could be a network or geocoder message. Only
 * permission has its own line; everything else is one plain sentence.
 */
const PERMISSION_MESSAGE = "Unable to get location. Please check permissions.";
const UNAVAILABLE_MESSAGE = "Couldn't find your location. Tap to try again.";

function quietFailure(error: unknown) {
  if (__DEV__) console.warn("Location lookup failed:", error);
  return UNAVAILABLE_MESSAGE;
}

export const fetchCurrentLocation = createAsyncThunk(
  "location/fetchCurrentLocation",
  async (_, { rejectWithValue }) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return rejectWithValue(PERMISSION_MESSAGE);
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // The position is known even when naming it fails: show it as the current location.
      return await resolvePlace(position.coords.latitude, position.coords.longitude, { lenient: true });
    } catch (error) {
      return rejectWithValue(quietFailure(error));
    }
  },
);

/**
 * A moved device's new place (user, 2026-11-14), from the movement watcher: resolved
 * quietly, the old place shown until the new one is ready. No permission prompt, the
 * watcher only runs once it was granted.
 */
export const updateLocationFrom = createAsyncThunk(
  "location/updateLocationFrom",
  async ({ latitude, longitude }: { latitude: number; longitude: number }, { rejectWithValue }) => {
    try {
      return await resolvePlace(latitude, longitude);
    } catch (error) {
      // The watcher's own failures change nothing on screen: the last place stays.
      return rejectWithValue(quietFailure(error));
    }
  },
);

async function resolvePlace(latitude: number, longitude: number, { lenient = false }: { lenient?: boolean } = {}) {
      const nextLocation = {
        city: null as string | null,
        country: null as string | null,
        countryCode: null as string | null,
        displayAddress: "Current Location",
        district: null as string | null,
        latitude,
        locality: null as string | null,
        longitude,
        pincode: null as string | null,
        searchHint: "",
        state: null as string | null,
      };

      // Naming the place needs the network. Offline, a first lookup still shows the
      // position as the current location; a moved one keeps the place it had.
      let addresses: Location.LocationGeocodedAddress[] = [];
      try {
        addresses = await Location.reverseGeocodeAsync({
          latitude: nextLocation.latitude,
          longitude: nextLocation.longitude,
        });
      } catch (error) {
        if (!lenient) throw error;
        if (__DEV__) console.warn("Reverse geocode failed:", error);
      }
      const primaryAddress = addresses[0];

      if (primaryAddress) {
        const resolved = resolveCurrentLocationAddress(primaryAddress);
        nextLocation.city = resolved.city;
        nextLocation.country = primaryAddress.country ?? null;
        nextLocation.countryCode = primaryAddress.isoCountryCode ?? null;
        nextLocation.locality = resolved.locality;
        nextLocation.pincode = primaryAddress.postalCode ?? null;
        nextLocation.state = primaryAddress.region ?? null;
        nextLocation.district = primaryAddress.district ?? primaryAddress.subregion ?? null;
        nextLocation.displayAddress = resolved.displayAddress;
        nextLocation.searchHint = resolved.searchHint;
      }

      return nextLocation;
}

const locationSlice = createSlice({
  name: "location",
  initialState,
  reducers: {
    clearLocation: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentLocation.pending, (state) => {
        state.error = null;
        state.status = "loading";
      })
      .addCase(fetchCurrentLocation.fulfilled, (state, action) => {
        state.city = action.payload.city;
        state.country = action.payload.country;
        state.countryCode = action.payload.countryCode;
        state.displayAddress = action.payload.displayAddress;
        state.district = action.payload.district;
        state.error = null;
        state.latitude = action.payload.latitude;
        state.locality = action.payload.locality;
        state.longitude = action.payload.longitude;
        state.pincode = action.payload.pincode;
        state.searchHint = action.payload.searchHint;
        state.state = action.payload.state;
        state.status = "ready";
      })
      // A moved device: the new place replaces the old with no loading state in between.
      .addCase(updateLocationFrom.fulfilled, (state, action) => {
        Object.assign(state, action.payload, { error: null, status: "ready" });
      })
      .addCase(fetchCurrentLocation.rejected, (state, action) => {
        state.error = typeof action.payload === "string" ? action.payload : UNAVAILABLE_MESSAGE;
        state.status = "error";
      });
  },
});

export const { clearLocation } = locationSlice.actions;
export const locationReducer = locationSlice.reducer;
