import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { PaymentOrder } from "@/store/services/payment-api";

type PaymentCheckoutState = {
  idempotencyKey: string | null;
  order: PaymentOrder | null;
};

const initialState: PaymentCheckoutState = {
  idempotencyKey: null,
  order: null,
};

export const paymentCheckoutSlice = createSlice({
  initialState,
  name: "paymentCheckout",
  reducers: {
    clearPaymentCheckout(state) {
      state.idempotencyKey = null;
      state.order = null;
    },
    setPaymentCheckout(state, action: PayloadAction<{ idempotencyKey: string; order: PaymentOrder }>) {
      state.idempotencyKey = action.payload.idempotencyKey;
      state.order = action.payload.order;
    },
  },
});

export const { clearPaymentCheckout, setPaymentCheckout } = paymentCheckoutSlice.actions;
export const paymentCheckoutReducer = paymentCheckoutSlice.reducer;
