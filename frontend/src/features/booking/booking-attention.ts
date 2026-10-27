export const BOOKING_ATTENTION = {
  RESPONSE: "Requests needing a response",
  TOKEN_CLAIMS: "Token claims to verify",
  CONFIRMATION: "Bookings to confirm",
  MOVE_IN: "Bookings past their move-in date",
  MOVE_IN_TODAY: "Bookings moving in today",
} as const;

export type BookingAttentionFilter = keyof typeof BOOKING_ATTENTION;

export function bookingAttention(value: string | string[] | undefined): BookingAttentionFilter | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first && Object.prototype.hasOwnProperty.call(BOOKING_ATTENTION, first) ? first as BookingAttentionFilter : undefined;
}
