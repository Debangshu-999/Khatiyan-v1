import { useState } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { DigestConcernsEmptyIcon } from "@/components/tenancy-line-icons";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerConcernQueueSkeleton } from "@/components/skeletons/owner";
import { CountPill } from "@/features/enquiry/enquiry-tags";
import { ActionButton } from "@/features/owner/owner-ui";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyConcernsRaisedTodayQuery, type ConcernSummary } from "@/store/services/concern-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";

import { ConcernCard } from "./owner-concerns";

/**
 * Concerns today: the concerns raised today, whatever their status now (user,
 * 2026-10-18).
 *
 * <p>Opened from the Concerns card in Home's live digest, which used to open
 * the Concerns module itself. This shows exactly what the card counted. Each
 * card is the Concerns screen's own, with View concern opening its details,
 * and Open Concerns is pinned at the bottom for the whole module.
 */
export default function OwnerConcernsTodayScreen() {
  const router = useGuardedRouter();
  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const properties = useListMyPropertiesQuery().data ?? [];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const concernsQuery = useListPropertyConcernsRaisedTodayQuery(property?.id ?? "", { skip: !property });
  const concerns = concernsQuery.data ?? [];
  const [footerHeight, setFooterHeight] = useState(PINNED_FOOTER_CLEARANCE);

  // The details screen's modes, chosen as the Concerns queues choose them: an
  // open concern is reviewed, one this person is working is theirs, the rest
  // are read.
  function openConcern(concern: ConcernSummary) {
    const finished = concern.status === "RESOLVED" || concern.status === "CLOSED";
    const mode = concern.status === "OPEN"
      ? "property"
      : !finished && concern.assignedToUserId === currentUserId ? "taken" : "history";
    router.push({ pathname: "/owner-concern-detail", params: { concernId: concern.id, mode, propertyId: concern.propertyId } });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenScrollView
        contentContainerStyle={{ paddingBottom: footerHeight + spacing.lg }}
        safeAreaEdges={["top", "bottom"]}
      >
        <ScreenHeader
          italicTail="today."
          subtitle={property ? `Concerns raised at ${property.name} today.` : undefined}
          title="Concerns"
        />

        {concernsQuery.isLoading ? <OwnerConcernQueueSkeleton /> : null}

        {!concernsQuery.isLoading && concerns.length === 0 ? (
          <EmptyState
            artworkNode={<DigestConcernsEmptyIcon size={64} />}
            title="No concerns raised today"
          />
        ) : null}

        {concerns.length > 0 ? <CountPill count={concerns.length} noun={["concern", "concerns"]} /> : null}

        {concerns.map((concern) => (
          <ConcernCard actionLabel="View concern" concern={concern} key={concern.id} onPress={() => openConcern(concern)} />
        ))}
      </ScreenScrollView>
      <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
        <View style={{ flexDirection: "row" }}>
          <ActionButton label="Open Concerns" onPress={() => router.push("/owner-concerns")} />
        </View>
      </PinnedFooter>
    </View>
  );
}
