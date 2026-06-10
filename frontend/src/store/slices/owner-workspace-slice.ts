import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type OwnerWorkspaceState = {
  selectedPropertyId: string | null;
};

const initialState: OwnerWorkspaceState = {
  selectedPropertyId: null,
};

const ownerWorkspaceSlice = createSlice({
  name: "ownerWorkspace",
  initialState,
  reducers: {
    setSelectedOwnerPropertyId(state, action: PayloadAction<string | null>) {
      state.selectedPropertyId = action.payload;
    },
  },
});

export const { setSelectedOwnerPropertyId } = ownerWorkspaceSlice.actions;
export const ownerWorkspaceReducer = ownerWorkspaceSlice.reducer;
