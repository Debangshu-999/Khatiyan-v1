import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import type { NotificationItem } from "@/store/services/notification-api";
import type { MealType } from "@/store/services/property-api";
import { MEAL_LABEL, formatMealWindow } from "@/features/food/food-ui";
import { softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Props = {
  notification: NotificationItem;
  onPress?: () => void;
  /**
   * Draws the unread ring regardless of what the server now says.
   *
   * <p>The notifications screen marks the whole queue read the moment it
   * opens, so by the time this renders every {@code readAt} is set. The ring
   * has to come from what was unread ON ARRIVAL, or the reader never sees
   * which alerts were the new ones. Omitted elsewhere, where `readAt` is
   * still the honest answer.
   */
  unread?: boolean;
};

type UrgencySignal = {
  label: "High" | "Urgent";
  tone: "danger" | "warning";
};

export function NotificationRow({ notification, onPress, unread }: Props) {
  const { colors, fonts, type } = useTheme();
  const isUnread = unread ?? !notification.readAt;
  const urgency = urgencySignal(notification.priority);
  const allDetails = notificationDetails(notification);
  // The property names the place, so it rides the time line rather than a row.
  const place = allDetails.find((detail) => detail.label === "Property")?.value;
  const details = allDetails.filter((detail) => detail.label !== "Property");
  const when = formatRelative(notification.createdAt);

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        // Unread is pale blue with a blue border (user, 2026-10-31). The New pill
        // says what it means, for a reader who cannot tell the colour.
        backgroundColor: isUnread ? colors.primarySoft : colors.surface,
        borderColor: isUnread ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        // softShadow, not useSoftShadow: this list is a tab, whose shadow a phone
        // does not draw (user, 2026-10-31).
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
      {/* No icons (user, 2026-11-01). The property on the left and the time on
          the right of one row, both bold. */}
      <View style={{ gap: spacing.xs }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20 }}>
            {notification.title}
          </Text>
          {urgency ? <UrgencyPill signal={urgency} /> : isUnread ? <NewPill /> : null}
        </View>
        <Text style={[type.description, { color: colors.inkSoft, fontSize: 13, lineHeight: 19 }]}>
          {notification.body}
        </Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          {place ? (
            <Text numberOfLines={1} style={{ color: colors.muted, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 12 }}>
              {place}
            </Text>
          ) : <View />}
          <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>
            {when}
          </Text>
        </View>
      </View>
      {details.length > 0 ? (
        <View
          style={{
            // White on the blue of an unread card, where grey would look muddy.
            backgroundColor: isUnread ? colors.surface : colors.surfaceSunken,
            borderCurve: "continuous",
            borderRadius: radii.card,
            paddingHorizontal: 12,
            paddingVertical: spacing.xxs,
          }}
        >
          {details.map((detail, index) => (
            <View
              key={`${detail.label}-${detail.value}`}
              style={{
                alignItems: "flex-start",
                borderTopColor: colors.border,
                borderTopWidth: index === 0 ? 0 : 1,
                flexDirection: "row",
                gap: spacing.md,
                justifyContent: "space-between",
                paddingVertical: 7,
              }}
            >
              <Text style={[type.caption, { color: colors.muted, fontSize: 12, lineHeight: 17 }]}>{detail.label}</Text>
              <Text
                style={{
                  color: colors.ink,
                  flexShrink: 1,
                  fontFamily: fonts.sansBold,
                  fontSize: 12,
                  lineHeight: 17,
                  textAlign: "right",
                }}
              >
                {detail.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

function NewPill() {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.primary,
        borderRadius: 999,
        marginTop: -3,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.5 }}>NEW</Text>
    </View>
  );
}

/** Tint and a caps label, nothing else. */
function UrgencyPill({ signal }: { signal: UrgencySignal }) {
  const { colors, fonts } = useTheme();
  const danger = signal.tone === "danger";

  return (
    <View
      style={{
        backgroundColor: danger ? colors.dangerSoft : colors.warningSoft,
        borderRadius: 999,
        marginTop: -3,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: danger ? colors.danger : colors.warningText,
          fontFamily: fonts.sansBold,
          fontSize: 10,
          letterSpacing: 0.5,
        }}
      >
        {signal.label.toUpperCase()}
      </Text>
    </View>
  );
}

function urgencySignal(priority: string): UrgencySignal | null {
  const normalized = priority.toUpperCase();
  if (normalized === "EMERGENCY" || normalized === "URGENT") {
    return { label: "Urgent", tone: "danger" };
  }
  if (normalized === "HIGH") {
    return { label: "High", tone: "warning" };
  }
  return null;
}

function notificationDetails(notification: NotificationItem) {
  const data = notification.data ?? {};
  const details: Array<{ label: string; value: string }> = [];

  switch (notification.subtype) {
    // Onboarding carries the same facts as a start — the bed is reserved and
    // the date is set — so it reads the same way. What differs is the title,
    // which says the tenancy has not begun yet.
    case "TENANT_ONBOARDED":
    case "TENANCY_STARTED":
    case "TENANCY_ENDED":
    case "TENANCY_PENDING_EXIT":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Tenancy", code(data.tenancyReferenceCode));
      add(
        details,
        notification.subtype === "TENANCY_ENDED" ? "End date" : notification.subtype === "TENANCY_PENDING_EXIT" ? "Checkout date" : "Start date",
        formatDate(data.startDate ?? data.endDate ?? data.checkoutDate),
      );
      break;
    case "BOOKED_BED_NOT_FREE":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Booking", code(data.bookingReferenceCode));
      add(details, "Move-in date", formatDate(data.moveInDate));
      break;
    case "FUTURE_BOOKING_BLOCKED":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Booked from", formatDate(data.startDate));
      add(details, "Tenancy", code(data.tenancyReferenceCode));
      break;
    // No room number and no dates: the tenancy never started, so the only
    // facts are which offer it was and who ended it. "Cancelled by" is the one
    // that matters — the same row otherwise reads identically whether the
    // tenant declined, the owner withdrew, or nobody acted at all.
    case "TENANCY_CANCELLED":
      add(details, "Property", data.propertyName);
      add(details, "Cancelled by", data.cancelledBy);
      add(details, "Reason", data.reason);
      add(details, "Tenancy", code(data.tenancyReferenceCode));
      break;
    case "TENANCY_ROOM_TRANSFERRED":
      add(details, "Property", data.propertyName);
      add(details, "New room", data.newRoomNumber);
      add(details, "Tenancy", code(data.tenancyReferenceCode));
      add(details, "Transfer date", formatDate(data.transferDate));
      break;
    // Every exit row quotes the REQUEST's short code. It used to print eight
    // characters of the tenancy UUID, which named nothing anyone could look up.
    case "TENANCY_EXIT_REQUESTED":
    case "TENANCY_EXIT_CANCELLED":
      add(details, "Property", data.propertyName);
      add(details, "Type", titleCase(data.exitType));
      add(details, "Checkout date", formatDate(data.requestedCheckoutDate));
      add(details, "Request", data.referenceCode);
      break;
    case "TENANCY_EXIT_APPROVED":
    case "TENANCY_EXIT_EXECUTED":
      add(details, "Property", data.propertyName);
      add(details, "Checkout date", formatDate(data.approvedCheckoutDate ?? data.checkoutDate));
      add(details, "Request", data.referenceCode);
      break;
    case "TENANCY_EXIT_EXPIRED":
      add(details, "Property", data.propertyName);
      add(details, "Type", titleCase(data.exitType));
      add(details, "Request", data.referenceCode);
      break;
    case "TENANCY_EXIT_WITHDRAWAL_REQUESTED":
    case "TENANCY_EXIT_WITHDRAWAL_APPROVED":
    case "TENANCY_EXIT_WITHDRAWAL_REJECTED":
      add(details, "Property", data.propertyName);
      // The date at stake either way: what they were leaving on, and what they
      // still leave on if the withdrawal is refused.
      add(details, "Checkout date", formatDate(data.approvedCheckoutDate));
      add(details, "Request", data.referenceCode);
      break;
    case "VERIFICATION_ATTEMPTS_ADDED":
      add(details, "Property", data.propertyName);
      add(details, "Check", data.checks);
      add(details, "Attempts added", data.attemptsAdded);
      break;
    case "TENANCY_AGREEMENT_EXPIRY_APPROACHING":
      add(details, "Property", data.propertyName);
      add(details, "Agreement ends", formatDate(data.agreementEndDate));
      add(details, "Days left", data.daysRemaining);
      add(details, "Tenancy", code(data.tenancyReferenceCode));
      break;
    case "CONCERN_RAISED":
    case "CONCERN_ASSIGNED":
    case "CONCERN_UNDER_REVIEW":
    case "CONCERN_IN_PROGRESS":
    case "CONCERN_RELEASED":
    case "CONCERN_RESOLVED":
    case "CONCERN_REOPENED":
      add(details, "Property", data.propertyName);
      add(details, "Concern", data.concernTitle);
      add(details, "Status", titleCase(data.status));
      add(details, "Reference", code(data.concernReferenceCode));
      break;
    // Every bill row names the bill by its BIL- code, which is the same code
    // the bill screens show. One-off bills have no cycle to speak of.
    case "BILLING_CYCLE_GENERATED":
      add(details, "Cycle", data.cycleNumber);
      add(details, "Due date", formatDate(data.rentDueDate));
      add(details, "Amount", formatPaise(data.totalAmountPaise));
      add(details, "Bill", code(data.billReferenceCode));
      break;
    case "BILLING_CYCLE_CANCELLED":
      add(details, "Amount", formatPaise(data.totalAmountPaise));
      add(details, "Bill", code(data.billReferenceCode));
      break;
    // A damage record naming the tenant, by its DMG- code (2026-10-29).
    case "DAMAGE_RECORDED":
    case "DAMAGE_RECORD_UPDATED":
    case "DAMAGE_RECORD_REMOVED":
      add(details, "Your share", formatPaise(data.amountPaise));
      add(details, "Record", code(data.damageRecordCode));
      break;
    case "BILLING_LATE_FEE_APPLIED":
      add(details, "Late fee", formatPaise(data.lateFeeAmountPaise));
      add(details, "Bill", code(data.billReferenceCode));
      break;
    case "BILLING_LINE_ITEM_CHANGED":
      add(details, "Line", data.label);
      add(details, "Type", titleCase(data.lineType));
      add(details, "Amount", formatPaise(data.amountPaise));
      add(details, "Status", titleCase(data.status));
      add(details, "Bill", code(data.billReferenceCode));
      break;
    case "PAYMENT_SUCCEEDED":
    case "PAYMENT_FAILED":
      add(details, "Amount", formatPaise(data.amountPaise));
      add(details, "Bill", code(data.billReferenceCode));
      add(details, "Reason", data.failureReason);
      break;
    case "BUDGET_RAISED":
      add(details, "Property", data.propertyName);
      add(details, "Raise", formatPaise(data.raiseAmountPaise));
      add(details, "New budget", formatPaise(data.effectiveBudgetPaise));
      add(details, "Reason", data.reason);
      break;
    case "BUDGET_UPDATED":
      add(details, "Property", data.propertyName);
      add(details, "Previous", formatPaise(data.previousDefaultPaise));
      add(details, "New budget", formatPaise(data.newDefaultPaise));
      break;
    case "BUDGET_APPROACHING":
    case "BUDGET_EXCEEDED":
      add(details, "Property", data.propertyName);
      break;
    case "NOTICE_PUBLISHED":
      add(details, "Property", data.propertyName);
      add(details, "Notice", data.noticeTitle);
      break;
    // Told to the enquirer, in neutral words (2026-10-03).
    case "ENQUIRY_CLOSED":
      add(details, "Property", data.propertyName);
      break;
    // The enquirer is interested again. Told to the handler (2026-10-03).
    case "ENQUIRY_MIND_CHANGED":
      add(details, "Property", data.propertyName);
      break;
    // Sent to whichever side did not book, move or cancel it (2026-10-03).
    case "VISIT_SCHEDULED":
    case "VISIT_RESCHEDULED":
    case "VISIT_CANCELLED":
      add(details, "Property", data.propertyName);
      add(details, notification.subtype === "VISIT_RESCHEDULED" ? "New time" : "Visit", data.visitWhen);
      add(details, "Reference", code(data.visitReferenceCode));
      break;
    // Reminders to the visitor, and a visitor running late told to the property (2026-10-04).
    case "VISIT_REMINDER_DAY_BEFORE":
    case "VISIT_REMINDER_TODAY":
    case "VISITOR_RUNNING_LATE":
      add(details, "Property", data.propertyName);
      add(details, "Visit", data.visitWhen);
      add(details, "Reference", code(data.visitReferenceCode));
      break;
    // A check-in, told to the visitor, the owner and every manager (2026-10-04).
    case "VISIT_CHECKED_IN":
      add(details, "Property", data.propertyName);
      add(details, "Visit", data.visitWhen);
      add(details, "Checked in", data.checkedInAt);
      add(details, "Reference", code(data.visitReferenceCode));
      break;
    // How to book after a visit, for a visitor with no email to mail it to (2026-10-18).
    case "VISIT_AFTER_BOOK_A_STAY":
      add(details, "Property", data.propertyName);
      add(details, "Book by", formatDate(data.bookUntil));
      add(details, "Visit", code(data.visitReferenceCode));
      break;
    // The tenant's own booking, each with a mail beside it (2026-10-18).
    case "BOOKING_CONFIRMED":
    case "BOOKING_MOVE_IN_TOMORROW":
    case "BOOKING_BED_NOT_READY":
    case "BOOKING_CANCELLED":
    case "BOOKING_EXPIRED":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      if (notification.subtype !== "BOOKING_EXPIRED") add(details, "Move-in date", formatDate(data.moveInDate));
      add(details, "Booking", code(data.bookingReferenceCode));
      break;
    // Before confirmation and the reminders (2026-10-19): the booking, and which room.
    case "BOOKING_OFFER_RECEIVED":
    case "BOOKING_TERMS_AGREED":
    case "BOOKING_TOKEN_LAPSING":
    case "BOOKING_REFUND_SENT":
    case "BOOKING_YOUR_TURN":
    case "BOOKING_REQUEST_YOUR_TURN":
    case "BOOKING_REQUEST_WAITING":
    case "BOOKING_TOKEN_CLAIM_WAITING":
    case "BOOKING_REFUND_OWED":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Booking", code(data.bookingReferenceCode));
      break;
    case "BOOKING_BOOK_AFTER_VISIT":
      add(details, "Property", data.propertyName);
      add(details, "Book by", formatDate(data.bookUntil));
      add(details, "Visit", code(data.visitReferenceCode));
      break;
    case "BOOKING_DATE_MOVED":
      add(details, "Property", data.propertyName);
      add(details, "New move-in date", formatDate(data.moveInDate));
      add(details, "Was", formatDate(data.originalMoveInDate));
      add(details, "Booking", code(data.bookingReferenceCode));
      break;
    // The property's own notices about a day or a slot of it (2026-10-04).
    case "VISITORS_TODAY":
    case "VISIT_SLOT_STARTING":
    case "VISIT_ATTENDANCE_NOT_MARKED":
      add(details, "Property", data.propertyName);
      add(details, "Slot", data.visitSlot);
      add(details, "Visitors", data.visitorCount);
      break;
    case "FOOD_MEAL_DELAYED":
      add(details, "Property", data.propertyName);
      add(details, "Meal", data.mealType ? MEAL_LABEL[data.mealType as MealType] : undefined);
      add(details, "New time", data.startTime && data.endTime ? formatMealWindow(data.startTime, data.endTime) : undefined);
      add(details, "Delayed by", data.delayMinutes ? `${data.delayMinutes} min` : undefined);
      break;
    case "MANAGER_ASSIGNED":
    case "MANAGER_REMOVED":
    case "MANAGER_EMPLOYMENT_UPDATED":
      add(details, "Property", data.propertyName);
      break;
    case "STAFF_ADDED":
    case "STAFF_REMOVED":
      add(details, "Property", data.propertyName);
      add(details, "Staff", data.staffName);
      add(details, "Category", data.categoryName);
      break;
    case "ROOM_MAINTENANCE_STARTED":
    case "ROOM_MAINTENANCE_ENDED":
    case "ROOM_DEACTIVATED":
    case "ROOM_REACTIVATED":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Reason", data.reason);
      break;
    default:
      break;
  }

  if (details.length === 0) {
    addFallbackSourceDetail(details, notification);
  }

  return details.slice(0, 5);
}

/**
 * For a row with no layout of its own (reminders, claims): whichever short
 * codes came with it. Never the source id, which used to print here as
 * "Payment reference: 8c7f8b9e" (user, 2026-09-30). With no code, no line.
 */
function addFallbackSourceDetail(details: Array<{ label: string; value: string }>, notification: NotificationItem) {
  const data = notification.data ?? {};
  add(details, "Bill", code(data.billReferenceCode));
  add(details, "Tenancy", code(data.tenancyReferenceCode));
  add(details, "Reference", code(data.concernReferenceCode ?? data.referenceCode));
}

function add(details: Array<{ label: string; value: string }>, label: string, value?: string | null) {
  if (!value || value === "null") {
    return;
  }
  details.push({ label, value });
}

// Notifications show short codes (BIL-2026-000123, TEN-..., CON-...) and never
// an internal id, not even cut short: eight characters of a UUID name nothing
// anyone can look up (user, 2026-09-30). This drops any id that ends up in a
// code field by mistake.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function code(value?: string | null) {
  if (!value || UUID_PATTERN.test(value)) {
    return null;
  }
  return value;
}

function titleCase(value?: string | null) {
  if (!value) {
    return null;
  }
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPaise(value?: string | null) {
  if (!value) {
    return null;
  }
  const amountPaise = Number(value);
  if (!Number.isFinite(amountPaise)) {
    return null;
  }
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: amountPaise % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(amountPaise / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return "";
  }

  const diffMs = Date.now() - then;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;

  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
