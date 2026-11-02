import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Two background refreshes in a row with no answer from the server: not a blip,
 * the server cannot be reached. A read with nothing to show counts at once, since
 * the screen has nothing else to draw.
 */
export const UNREACHABLE_AFTER = 2;

/**
 * Whether the server is answering at all (user, 2026-10-31).
 *
 * <p>Any answer resets it, a refusal included: the server is there. Saves do not
 * count, since their failure is said where it happened and must not take away a
 * form someone has filled in.
 */
const connectionSlice = createSlice({
  name: "connection",
  initialState: { unansweredReads: 0 },
  reducers: {
    readUnanswered: (state, action: PayloadAction<{ nothingToShow: boolean }>) => {
      state.unansweredReads = action.payload.nothingToShow ? Math.max(UNREACHABLE_AFTER, state.unansweredReads + 1) : state.unansweredReads + 1;
    },
    serverAnswered: (state) => {
      state.unansweredReads = 0;
    },
  },
});

export const { readUnanswered, serverAnswered } = connectionSlice.actions;
export const connectionReducer = connectionSlice.reducer;
