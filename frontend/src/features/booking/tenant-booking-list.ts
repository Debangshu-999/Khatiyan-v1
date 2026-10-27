import type { BookingRequestListItem, BookingStatus } from "@/store/services/booking-api";

export type TenantBookingTab = "ACTIVE" | "CONFIRMED" | "HISTORY";

export const TENANT_BOOKING_TABS = [
  { value: "ACTIVE", label: "Active" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "HISTORY", label: "History" },
] satisfies { value: TenantBookingTab; label: string }[];

export function tenantBookingTab(status: BookingStatus): TenantBookingTab {
  if (status === "CONFIRMED") return "CONFIRMED";
  if (["CANCELLED", "EXPIRED", "MOVED_IN"].includes(status)) return "HISTORY";
  return "ACTIVE";
}

export function filterTenantBookings(items: BookingRequestListItem[], tab: TenantBookingTab, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  return items.filter((item) => tenantBookingTab(item.status) === tab && (!needle ||
    [item.propertyName, item.referenceCode, item.roomNumber].some((value) => value.toLocaleLowerCase().includes(needle))));
}

export function tenantBookingCount(count: number, tab: TenantBookingTab) {
  const noun = tab === "ACTIVE" ? "active request" : tab === "CONFIRMED" ? "confirmed booking" : "past booking";
  return count === 0 ? `No ${noun}s` : `${count} ${noun}${count === 1 ? "" : "s"}`;
}
