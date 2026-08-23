import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, Siren, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import type { NotificationItem } from "@/store/services/notification-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Props = {
  notification: NotificationItem;
  onPress?: () => void;
};

type UrgencySignal = {
  icon: ComponentType<LucideProps>;
  label: "High" | "Urgent";
  tone: "danger" | "warning";
};

export function NotificationRow({ notification, onPress }: Props) {
  const { colors, fonts, type } = useTheme();
  const isUnread = !notification.readAt;
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
      <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
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
    case "TENANCY_STARTED":
    case "TENANCY_ENDED":
      add(details, "Property", data.propertyName);
      add(details, "Room", data.roomNumber);
      add(details, "Tenancy ID", shortId(data.tenancyId));
      add(details, notification.subtype === "TENANCY_STARTED" ? "Start date" : "End date", formatDate(data.startDate ?? data.endDate));
      break;
    case "TENANCY_ROOM_TRANSFERRED":
      add(details, "Property", data.propertyName);
      add(details, "New room", data.newRoomNumber);
      add(details, "Tenancy ID", shortId(data.tenancyId));
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
    case "TENANCY_AGREEMENT_EXPIRY_APPROACHING":
      add(details, "Property", data.propertyName);
      add(details, "Agreement ends", formatDate(data.agreementEndDate));
      add(details, "Days left", data.daysRemaining);
      add(details, "Tenancy ID", shortId(data.tenancyId));
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
      add(details, "Concern ID", shortId(data.concernId));
      break;
    case "BILLING_CYCLE_GENERATED":
      add(details, "Cycle", data.cycleNumber);
      add(details, "Due date", formatDate(data.rentDueDate));
      add(details, "Amount", formatPaise(data.totalAmountPaise));
      add(details, "Tenancy ID", shortId(data.tenancyId));
      break;
    case "BILLING_LATE_FEE_APPLIED":
      add(details, "Late fee", formatPaise(data.lateFeeAmountPaise));
      add(details, "Billing cycle ID", shortId(data.billingCycleId));
      add(details, "Tenancy ID", shortId(data.tenancyId));
      break;
    case "BILLING_LINE_ITEM_CHANGED":
      add(details, "Line", data.label);
      add(details, "Type", titleCase(data.lineType));
      add(details, "Amount", formatPaise(data.amountPaise));
      add(details, "Status", titleCase(data.status));
      break;
    case "PAYMENT_SUCCEEDED":
    case "PAYMENT_FAILED":
      add(details, "Amount", formatPaise(data.amountPaise));
      add(details, "Billing cycle ID", shortId(data.billingCycleId));
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

function addFallbackSourceDetail(details: Array<{ label: string; value: string }>, notification: NotificationItem) {
  // Prefer the human-readable TEN- reference the backend attaches; only fall
  // back to the (truncated) raw source UUID when it is absent.
  const tenancyRef = notification.data?.tenancyReferenceCode ?? null;
  const sourceId = shortId(notification.sourceId);

  if (notification.category === "TENANCY" && tenancyRef) {
    add(details, "Tenancy ID", tenancyRef);
    return;
  }

  if (!sourceId) {
    return;
  }

  switch (notification.category) {
    case "TENANCY":
      add(details, "Tenancy ID", sourceId);
      break;
    case "CONCERN":
      add(details, "Concern ID", sourceId);
      break;
    case "NOTICE":
      add(details, "Notice ID", sourceId);
      break;
    case "PAYMENT":
      add(details, "Payment reference", sourceId);
      break;
    case "PROPERTY":
      add(details, "Property ID", sourceId);
      break;
    case "AUTH":
      add(details, "Account ID", sourceId);
      break;
    default:
      break;
  }
}

function add(details: Array<{ label: string; value: string }>, label: string, value?: string | null) {
  if (!value || value === "null") {
    return;
  }
  details.push({ label, value });
}

// Raw UUIDs (36 chars, hyphen-segmented hex) are unreadable, so shorten those to
// their leading segment. Human reference codes (e.g. TEN-2026-000108) are already
// short and meaningful — never slice them.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shortId(value?: string | null) {
  if (!value) {
    return null;
  }
  return UUID_PATTERN.test(value) ? value.slice(0, 8) : value;
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
