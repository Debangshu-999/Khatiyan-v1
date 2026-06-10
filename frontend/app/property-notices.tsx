import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Megaphone } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import type { NoticeSummary } from "@/store/services/notice-api";
import { useListMyVisibleNoticesQuery } from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function PropertyNoticesScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const noticesQuery = useListMyVisibleNoticesQuery();
  const notices = [...(noticesQuery.data ?? [])].sort(compareNoticePriority);

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="Property notices"
        title="Notices,"
        italicTail="published."
        subtitle="Active announcements for your current property, including notices generated from recurring schedules."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      <Section eyebrow="Visible now" title="Published notices">
        {noticesQuery.isFetching ? (
          <Card>
            <ActivityIndicator color={colors.primary} />
            <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
              Loading notices
            </Text>
          </Card>
        ) : notices.length > 0 ? (
          notices.map((notice) => <NoticeCard key={notice.id} notice={notice} />)
        ) : (
          <EmptyState
            icon={Bell}
            eyebrow="Notices"
            title="No active notices"
            description="Published property notices will appear here when they are visible to tenants."
          />
        )}
      </Section>
    </ScreenScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="Go back"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function NoticeCard({ notice }: { notice: NoticeSummary }) {
  const { colors, type } = useTheme();
  const urgent = notice.priority === "URGENT" || notice.priority === "EMERGENCY";

  return (
    <Card tone={urgent ? "default" : "sunken"}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: urgent ? colors.primarySoft : colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <Megaphone color={urgent ? colors.primary : colors.kicker} size={19} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: urgent ? colors.primary : colors.kicker, flex: 1 }]} selectable>
              {formatDate(notice.publishedAt)}
            </Text>
            <StatusPill label={humanizeToken(notice.priority)} tone={urgent ? "primary" : "neutral"} />
          </View>
          <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]} selectable>
            {notice.title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {notice.body}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function compareNoticePriority(left: NoticeSummary, right: NoticeSummary) {
  const rank: Record<string, number> = {
    EMERGENCY: 4,
    URGENT: 3,
    IMPORTANT: 2,
    NORMAL: 1,
  };
  const priorityDiff = (rank[right.priority] ?? 0) - (rank[left.priority] ?? 0);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
