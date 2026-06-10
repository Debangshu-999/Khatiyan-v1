import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as Location from "expo-location";

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

export const fetchCurrentLocation = createAsyncThunk(
  "location/fetchCurrentLocation",
  async (_, { rejectWithValue }) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return rejectWithValue("Unable to get location. Please check permissions.");
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextLocation = {
        city: null as string | null,
        country: null as string | null,
        countryCode: null as string | null,
        displayAddress: "Current Location",
        district: null as string | null,
        latitude: position.coords.latitude,
        locality: null as string | null,
        longitude: position.coords.longitude,
        pincode: null as string | null,
        searchHint: "",
        state: null as string | null,
      };

      const addresses = await Location.reverseGeocodeAsync({
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
      });
      const primaryAddress = addresses[0];

      if (primaryAddress) {
        nextLocation.city = primaryAddress.city ?? null;
        nextLocation.country = primaryAddress.country ?? null;
        nextLocation.countryCode = primaryAddress.isoCountryCode ?? null;
        nextLocation.locality =
          primaryAddress.street ??
          primaryAddress.name ??
          primaryAddress.district ??
          primaryAddress.subregion ??
          primaryAddress.city ??
          null;
        nextLocation.pincode = primaryAddress.postalCode ?? null;
        nextLocation.state = primaryAddress.region ?? null;
        nextLocation.district =
          primaryAddress.district ??
          primaryAddress.subregion ??
          primaryAddress.city ??
          primaryAddress.name ??
          null;
        nextLocation.displayAddress = formatDisplayAddress(nextLocation);
        nextLocation.searchHint = formatSearchHint(nextLocation);
      }

      return nextLocation;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : "Unable to get location.");
    }
  },
);

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
      .addCase(fetchCurrentLocation.rejected, (state, action) => {
        state.error = typeof action.payload === "string" ? action.payload : "Unable to get location.";
        state.status = "error";
      });
  },
});

export const { clearLocation } = locationSlice.actions;
export const locationReducer = locationSlice.reducer;

function formatDisplayAddress(location: {
  city: string | null;
  country: string | null;
  district: string | null;
  locality: string | null;
  pincode: string | null;
  state: string | null;
}) {
  const primaryParts = [location.locality, location.city ?? location.district]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, parts) => parts.indexOf(part) === index);
  const suffixParts = [location.state, location.pincode, location.country].filter((part): part is string =>
    Boolean(part),
  );
  const addressParts = [...primaryParts, suffixParts.join(" ")].filter(Boolean);

  return addressParts.length > 0 ? addressParts.join(", ") : "Current Location";
}

function formatSearchHint(location: {
  city: string | null;
  district: string | null;
  locality: string | null;
}) {
  return [location.locality, location.city ?? location.district]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(", ");
}
