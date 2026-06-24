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
        backgroundColor: isUnread ? colors.primarySoft : colors.surface,
        borderColor: isUnread ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.lg,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {humanizeCategory(notification.category)}
        </Text>
        {urgency ? <UrgencyMarker signal={urgency} /> : null}
      </View>

      <Text
        style={{
          color: isUnread ? colors.ink : colors.inkSoft,
          fontFamily: fonts.display,
          fontSize: 17,
          fontWeight: isUnread ? "500" : "400",
          letterSpacing: -0.2,
          lineHeight: 22,
        }}
        selectable
      >
        {notification.title}
      </Text>
      <Text style={[type.body, { color: colors.muted, fontSize: 14 }]} selectable>
        {notification.body}
      </Text>
      {details.length > 0 ? (
        <View style={{ gap: spacing.xxs }}>
          {details.map((detail) => (
            <Text
              key={`${detail.label}-${detail.value}`}
              style={[type.caption, { color: colors.inkSoft, fontSize: 12 }]}
              selectable
            >
              <Text style={{ color: colors.kicker, fontWeight: "700" }}>{detail.label}: </Text>
              {detail.value}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[type.caption, { color: colors.kicker, fontFamily: fonts.mono, fontSize: 11 }]} selectable>
        {formatRelative(notification.createdAt)}
      </Text>
    </AnimatedPressable>
  );
}

function UrgencyMarker({ signal }: { signal: UrgencySignal }) {
  const { colors, fonts } = useTheme();
  const Icon = signal.icon;
  const tone = signal.tone === "danger" ? colors.danger : colors.warningText;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <Icon color={tone} size={15} strokeWidth={2.5} />
      <Text
        style={{
          color: tone,
          fontFamily: fonts.sans,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
        selectable
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
    case "TENANCY_EXIT_REQUESTED":
    case "TENANCY_EXIT_CANCELLED":
      add(details, "Property", data.propertyName);
      add(details, "Type", titleCase(data.exitType));
      add(details, "Checkout date", formatDate(data.requestedCheckoutDate));
      add(details, "Tenancy ID", shortId(data.tenancyId));
      break;
    case "TENANCY_EXIT_APPROVED":
    case "TENANCY_EXIT_EXECUTED":
      add(details, "Property", data.propertyName);
      add(details, "Checkout date", formatDate(data.approvedCheckoutDate ?? data.checkoutDate));
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
  const sourceId = shortId(notification.sourceId);
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

function shortId(value?: string | null) {
  if (!value) {
    return null;
  }
  return value.length > 12 ? value.slice(0, 8) : value;
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

function humanizeCategory(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
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
