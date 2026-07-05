import { useCallback } from "react";
import { ScrollView, Text } from "react-native";
import { Bell, Building2, CreditCard, KeyRound, Megaphone, ShieldAlert, UserRound, Wallet } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useAppSelector } from "@/store/hooks";
import type { NotificationItem } from "@/store/services/notification-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type AlertSource = "billing" | "budget" | "concern" | "tenancy" | "notice" | "property" | "account" | "other";
export type AlertTopic = "all" | AlertSource;

const TOPIC_BUBBLES: Array<{ key: AlertSource; label: string }> = [
  { key: "billing", label: "Billing" },
  { key: "budget", label: "Budget" },
  { key: "concern", label: "Concerns" },
  { key: "tenancy", label: "Tenancy" },
  { key: "notice", label: "Notices" },
  { key: "property", label: "Property" },
  { key: "account", label: "Account" },
  { key: "other", label: "Other" },
];

const ALERT_ICONS = {
  account: UserRound,
  billing: CreditCard,
  budget: Wallet,
  concern: ShieldAlert,
  notice: Megaphone,
  other: Bell,
  property: Building2,
  tenancy: KeyRound,
} as const;

export function notificationSource(notification: NotificationItem): AlertSource {
  const category = notification.category.toUpperCase();
  const subtype = notification.subtype?.toUpperCase() ?? "";

  // Budget (category EXPENSE) is split out from the property bucket so owners
  // can filter raises, edits and threshold alerts on their own.
  if (category === "EXPENSE" || subtype.startsWith("BUDGET_")) {
    return "budget";
  }
  if (category === "BILLING" || category === "PAYMENT" || subtype.startsWith("BILLING_") || subtype.startsWith("PAYMENT_")) {
    return "billing";
  }
  if (category === "CONCERN" || subtype.startsWith("CONCERN_")) {
    return "concern";
  }
  if (category === "TENANCY" || subtype.startsWith("TENANCY_")) {
    return "tenancy";
  }
  if (category === "NOTICE" || subtype.startsWith("NOTICE_")) {
    return "notice";
  }
  if (category === "PROPERTY" || category === "MANAGER" || subtype.startsWith("MANAGER_")) {
    return "property";
  }
  if (category === "AUTH" || category === "ACCOUNT") {
    return "account";
  }
  return "other";
}

export type TopicCounts = Record<AlertSource, number> & { total: number };

export function countByTopic(notifications: NotificationItem[]): TopicCounts {
  const counts: TopicCounts = {
    account: 0,
    billing: 0,
    budget: 0,
    concern: 0,
    notice: 0,
    other: 0,
    property: 0,
    tenancy: 0,
    total: notifications.length,
  };
  notifications.forEach((notification) => {
    counts[notificationSource(notification)] += 1;
  });
  return counts;
}

// Client-side pager over the in-memory feed, same pattern as owner-billing:
// the topic/property filters need the whole list anyway, so pages are slices.
export function paginateAlerts<T>(items: T[], page: number, size: number) {
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;
  return {
    hasNext: safePage + 1 < totalPages,
    hasPrevious: safePage > 0,
    page: safePage,
    pageItems: items.slice(start, start + size),
    totalElements,
    totalPages,
  };
}

/**
 * Property scoping for management alert feeds. Notifications carry the
 * property in their jsonb `data.propertyId` (no dedicated column); rows
 * without one — account-level alerts, legacy rows — stay visible everywhere.
 * Tenant accounts are never property-scoped.
 */
export function usePropertyAlertScope() {
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const isManagement = activeAccount === "owner" || activeAccount === "manager";
  const propertiesQuery = useListMyPropertiesQuery(undefined, { skip: !isManagement });
  const properties = propertiesQuery.data ?? [];
  // Mirrors Home's resolveSelectedProperty: explicit pick, or the only property.
  const selectedProperty = selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;

  const inPropertyScope = useCallback(
    (notification: NotificationItem) => {
      if (!isManagement || !selectedProperty) {
        return true;
      }
      const propertyId = notification.data?.propertyId;
      return !propertyId || propertyId === selectedProperty.id;
    },
    [isManagement, selectedProperty],
  );

  return { activeAccount, inPropertyScope, isManagement, selectedProperty };
}

/**
 * Sideways-scrollable topic filter: "All" plus every category, always visible
 * (zero counts included), bleeding to the screen edges so the row reads as
 * scrollable.
 */
export function TopicBubbleRow({
  active,
  counts,
  onChange,
}: {
  active: AlertTopic;
  counts: TopicCounts;
  onChange: (topic: AlertTopic) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.lg }}
    >
      <TopicBubble active={active === "all"} count={counts.total} label="All" onPress={() => onChange("all")} />
      {TOPIC_BUBBLES.map((bubble) => (
        <TopicBubble
          active={active === bubble.key}
          count={counts[bubble.key] ?? 0}
          key={bubble.key}
          label={bubble.label}
          onPress={() => onChange(bubble.key)}
          source={bubble.key}
        />
      ))}
    </ScrollView>
  );
}

function TopicBubble({
  active,
  count,
  label,
  onPress,
  source,
}: {
  active: boolean;
  count: number;
  label: string;
  onPress: () => void;
  source?: AlertSource;
}) {
  const { colors, fonts } = useTheme();
  const Icon = source ? ALERT_ICONS[source] : null;
  const color = active ? colors.primary : colors.inkSoft;

  return (
    <AnimatedPressable
      accessibilityLabel={`Filter alerts by ${label}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : colors.surface,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      {Icon ? <Icon color={color} size={13} strokeWidth={2.3} /> : null}
      <Text style={{ color, fontFamily: fonts.sans, fontSize: 12, fontWeight: "800" }} selectable={false}>
        {label}
      </Text>
      <Text
        style={{
          color: active ? colors.primary : colors.kicker,
          fontFamily: fonts.sans,
          fontSize: 11,
          fontVariant: ["tabular-nums"],
          fontWeight: "800",
        }}
        selectable={false}
      >
        {count}
      </Text>
    </AnimatedPressable>
  );
}
