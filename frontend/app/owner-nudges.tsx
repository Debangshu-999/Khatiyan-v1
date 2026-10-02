import { useState } from "react";
import { Text, View } from "react-native";
import { BellRing } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerRequestListSkeleton } from "@/components/skeletons/owner";
import { NudgeSheet } from "@/features/nudge/nudge-sheet";
import { ActionButton } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { NUDGE_REFETCH_OPTIONS, useListSentNudgesQuery, type Nudge } from "@/store/services/nudge-api";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CONCERN_EMPTY_ILLUSTRATION = require("../assets/empty-states/concern-empty_state.png");

/**
 * The nudges management sent for the active property.
 *
 * <p>One list, no tabs. Sending starts from a Nudge button, which opens
 * {@link NudgeSheet}: the tenants, then the message for the one picked.
 *
 * <p>Embedded, this is the Nudges section of the Chats tab, and that screen owns
 * the floating button and the sheet, because a button inside its scroll content
 * would scroll away. Standing alone, the button sits under the header.
 */
export default function OwnerNudgesScreen({ embedded = false }: { embedded?: boolean }) {
  const { colors, type } = useTheme();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);

  const [sheetOpen, setSheetOpen] = useState(false);

  const sentQuery = useListSentNudgesQuery(selectedProperty?.id ?? "", {
    ...NUDGE_REFETCH_OPTIONS,
    skip: !selectedProperty,
  });
  const sent = sentQuery.data ?? [];

  const content = (
    <>
      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Nudges are scoped to the active owner property."
          icon={BellRing}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        // No count heading. The list is the whole section, and a "0 nudges"
        // band above an empty state said the same thing twice.
        sentQuery.isFetching && sent.length === 0 ? (
          <OwnerRequestListSkeleton />
        ) : sent.length === 0 ? (
          // Held in the middle of the space under the pills, like the other
          // sections of the Chats tab. Needs the scroll content to grow.
          <View style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState
              description="Nudges you and your managers send appear here for seven days. Send one with the Nudge button."
              artwork={CONCERN_EMPTY_ILLUSTRATION}
              title="Nothing sent"
            />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {sent.map((nudge) => (
              <SentNudgeCard key={nudge.id} nudge={nudge} />
            ))}
            <Text style={[type.caption, { color: colors.kicker, textAlign: "center" }]}>
              Showing the last 7 days.
            </Text>
          </View>
        )
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        italicTail="sent."
        subtitle={selectedProperty
          ? "One-way, tenants cannot reply. Each tenant can be nudged once every 3 hours."
          : "Select a property from Home first."}
        title="Nudges"
      />
      {selectedProperty ? (
        <ActionButton icon={BellRing} label="Nudge a tenant" onPress={() => setSheetOpen(true)} />
      ) : null}
      {content}
      {sheetOpen && selectedProperty ? (
        <NudgeSheet onClose={() => setSheetOpen(false)} propertyId={selectedProperty.id} />
      ) : null}
    </ScreenScrollView>
  );
}

function SentNudgeCard({ nudge }: { nudge: Nudge }) {
  const { colors, type } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          To {nudge.recipientName ?? "tenant"}
          {nudge.roomNumber ? ` · Room ${nudge.roomNumber}` : ""}
        </Text>
        <Text style={[type.quote, { color: colors.ink }]}>
          {nudge.message}
        </Text>
        {/* Who and when share the footer row, pushed to opposite edges — the
            two facts you scan a sent list for, and neither belongs buried in
            the eyebrow with the addressee. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: colors.kicker, flex: 1 }]} numberOfLines={1}>
            {nudge.sentByViewer ? "Sent by you" : `Sent by ${nudge.senderName ?? "a manager"}`}
          </Text>
          <Text style={[type.caption, { color: colors.kicker }]}>
            {formatWhen(nudge.sentAt)}
          </Text>
        </View>
      </View>
    </Card>
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

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  return selectedPropertyId
    ? properties.find((property) => property.id === selectedPropertyId) ?? null
    : properties.length === 1
      ? properties[0]
      : null;
}
