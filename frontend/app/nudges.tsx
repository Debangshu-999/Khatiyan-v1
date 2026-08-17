import { Text, View } from "react-native";
import { BellRing } from "lucide-react-native";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { NUDGE_REFETCH_OPTIONS, useListReceivedNudgesQuery, type Nudge } from "@/store/services/nudge-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The tenant's nudges.
 *
 * <p>No tabs and no actions: a nudge cannot be replied to, cleared or archived,
 * so the whole screen is a list. Fetching it is what marks them read — the
 * response still carries the state from before this visit, so the ones that were
 * new are marked as new on the visit that clears them.
 */
export default function NudgesScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const nudgesQuery = useListReceivedNudgesQuery(undefined, NUDGE_REFETCH_OPTIONS);

  const nudges = nudgesQuery.data ?? [];

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        eyebrow="Notifications"
        italicTail="for you."
        onBack={() => router.back()}
        subtitle="Short messages from your property. These are one-way — reply through a concern if you need to."
        title="Nudges"
      />

      {nudgesQuery.isLoading ? <SkeletonCard /> : null}

      {nudgesQuery.isError ? (
        <EmptyState
          description="Check your connection, then pull down to try again."
          eyebrow="Backend unreachable"
          icon={BellRing}
          title="Couldn't load nudges"
        />
      ) : null}

      {!nudgesQuery.isLoading && !nudgesQuery.isError && nudges.length === 0 ? (
        <EmptyState
          description="When your owner or manager sends you one, it shows up here."
          eyebrow="Quiet for now"
          icon={BellRing}
          title="No nudges"
        />
      ) : null}

      {nudges.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          {nudges.map((nudge) => (
            <NudgeRow key={nudge.id} nudge={nudge} />
          ))}
          <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
            Showing the last 7 days.
          </Text>
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

/**
 * A coloured left rule rather than a card: a nudge is a message to read, not a
 * record to act on, and the deposit-movement rule is the treatment this app
 * already uses for that. Unread ones carry the accent; read ones a hairline.
 */
function NudgeRow({ nudge }: { nudge: Nudge }) {
  const { colors, type } = useTheme();
  const unread = nudge.readAt === null;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderLeftColor: unread ? colors.primary : colors.borderStrong,
        borderLeftWidth: 5,
        borderWidth: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]}>
        {nudge.senderName ?? "Your property"} · {formatWhen(nudge.sentAt)}
      </Text>
      <Text style={[type.body, { color: colors.ink }]}>
        {nudge.message}
      </Text>
    </View>
  );
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
