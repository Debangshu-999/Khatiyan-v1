import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type OwnerPinsState = {
  pinnedKeys: string[];
};

const initialState: OwnerPinsState = {
  pinnedKeys: [],
};

const ownerPinsSlice = createSlice({
  name: "ownerPins",
  initialState,
  reducers: {
    setPinnedOwnerModules(state, action: PayloadAction<string[]>) {
      state.pinnedKeys = action.payload;
    },
  },
});

export const { setPinnedOwnerModules } = ownerPinsSlice.actions;
export const ownerPinsReducer = ownerPinsSlice.reducer;
