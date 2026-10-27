import { Text, View } from "react-native";
import { CalendarCheck, CircleAlert } from "lucide-react-native";

import { Skeleton } from "@/components/skeletons/primitives";
import { useIsSkeleton } from "@/components/skeletons/boundary";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useGetBookingFormOptionsQuery } from "@/store/services/booking-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** A visited card may offer a booking even when management closed its enquiry. */
export function BookAStayEntry({ enquiryId }: { enquiryId: string }) {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const ghost = useIsSkeleton();
  const query = useGetBookingFormOptionsQuery(enquiryId, { skip: ghost, refetchOnMountOrArgChange: true, refetchOnFocus: true });
  const options = query.currentData;
  if (ghost) return null;
  if (!options && !query.isError) return <Skeleton height={44} radius={10} />;
  // If availability could not be read, the button opens the form's explicit
  // error/retry state. It never treats a network failure as an expired visit.
  return <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
    {options?.canBook && options.windowEndsOn ? <Text style={[type.description, { color: colors.muted }]}>Booking window ends {bookingDateLabel(options.windowEndsOn)}</Text> : null}
    <View style={{ flexDirection: "row" }}><ActionButton icon={CalendarCheck} label={options?.existingRequestId ? "View booking" : "Book a stay"} onPress={() => router.push(options?.existingRequestId ? { pathname: "/my-booking-detail", params: { requestId: options.existingRequestId } } : { pathname: "/booking-request", params: { enquiryId } })} /></View>
    {/* Why this visit cannot book, under the button, beside a red warning mark (user, 2026-10-10). */}
    {options && !options.canBook && !options.existingRequestId && options.whyNot ? <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
      <CircleAlert color={colors.danger} size={15} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={[type.description, { color: colors.muted, flex: 1 }]}>{options.whyNot}</Text>
    </View> : null}
  </View>;
}
