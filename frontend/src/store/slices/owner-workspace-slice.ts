import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type OwnerWorkspaceState = {
  selectedPropertyId: string | null;
  /**
   * True once the last-used property has been read back from the device (user,
   * 2026-11-14: open on the PG someone last had, not the list's first). Home waits
   * for it before falling back to the first property, or the fallback would win the
   * race and overwrite what was remembered.
   */
  restored: boolean;
};

const initialState: OwnerWorkspaceState = {
  restored: false,
  selectedPropertyId: null,
};

const ownerWorkspaceSlice = createSlice({
  name: "ownerWorkspace",
  initialState,
  reducers: {
    setSelectedOwnerPropertyId(state, action: PayloadAction<string | null>) {
      state.selectedPropertyId = action.payload;
    },
    /** The remembered property, or null for none. Never overrides a choice made meanwhile. */
    restoreSelectedOwnerProperty(state, action: PayloadAction<string | null>) {
      if (!state.selectedPropertyId && action.payload) state.selectedPropertyId = action.payload;
      state.restored = true;
    },
    /** Another account signed in, or none: its own property is read back afresh. */
    resetOwnerWorkspace() {
      return initialState;
    },
  },
});

export const { resetOwnerWorkspace, restoreSelectedOwnerProperty, setSelectedOwnerPropertyId } = ownerWorkspaceSlice.actions;
export const ownerWorkspaceReducer = ownerWorkspaceSlice.reducer;
