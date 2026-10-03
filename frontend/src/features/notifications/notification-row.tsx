import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, Siren, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import type { NotificationItem } from "@/store/services/notification-api";
import type { MealType } from "@/store/services/property-api";
import { MEAL_LABEL, formatMealWindow } from "@/features/food/food-ui";
import { spacing } from "@/theme/spacing";
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
  icon: ComponentType<LucideProps>;
  label: "High" | "Urgent";
  tone: "danger" | "warning";
};

export function NotificationRow({ notification, onPress, unread }: Props) {
  const { colors, fonts, type } = useTheme();
  const isUnread = unread ?? !notification.readAt;
  const urgency = urgencySignal(notification.priority);
  const details = notificationDetails(notification);

  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderColor: isUnread ? colors.accent : colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        // Unread is carried by the edge alone, so it has to be heavy enough to
        // read at a glance down a list.
        borderWidth: isUnread ? 2 : 1,
        gap: spacing.sm,
        padding: spacing.lg,
      }}
    >
      {/* Urgency rides the title line rather than a row of its own.
          The category eyebrow that used to sit up here is gone — it duplicated
          the filter bubble already selected above the list — and leaving the
          marker alone on that row kept the empty band it used to fill. */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <Text
          style={{
            color: isUnread ? colors.ink : colors.inkSoft,
            flex: 1,
            fontFamily: fonts.display,
            fontSize: 17,
            fontWeight: isUnread ? "500" : "400",
            letterSpacing: -0.2,
            lineHeight: 22,
          }}
        >
          {notification.title}
        </Text>
        {/* Nudged down a couple of px: the display face sits high in its line
            box, so a marker aligned to the box top reads as floating. */}
        {urgency ? (
          <View style={{ marginTop: 3 }}>
            <UrgencyMarker signal={urgency} />
          </View>
        ) : null}
      </View>
      <Text style={[type.description, { color: colors.muted }]}>
        {notification.body}
      </Text>
      {details.length > 0 ? (
        <View style={{ gap: spacing.xxs }}>
          {details.map((detail) => (
            <Text
              key={`${detail.label}-${detail.value}`}
              style={[type.caption, { color: colors.inkSoft, fontSize: 12 }]}
            >
              <Text style={{ color: colors.kicker, fontWeight: "700" }}>{detail.label}: </Text>
              {detail.value}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[type.caption, { color: colors.kicker, fontFamily: fonts.mono, fontSize: 11 }]}>
        {formatRelative(notification.createdAt)}
      </Text>
    </AnimatedPressable>
  );
}

function UrgencyMarker({ signal }: { signal: UrgencySignal }) {
  const { colors, type } = useTheme();
  const Icon = signal.icon;
  const tone = signal.tone === "danger" ? colors.danger : colors.warningText;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <Icon color={tone} size={15} strokeWidth={2.5} />
      <Text
        style={[type.eyebrow, { color: tone }]}
      >
        {signal.label}
      </Text>
    </View>
  );
}

function urgencySignal(priority: string): UrgencySignal | null {
  const normalized = priority.toUpperCase();
  if (normalized === "EMERGENCY" || normalized === "URGENT") {
    return { icon: Siren, label: "Urgent", tone: "danger" };
  }
  if (normalized === "HIGH") {
    return { icon: AlertTriangle, label: "High", tone: "warning" };
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
