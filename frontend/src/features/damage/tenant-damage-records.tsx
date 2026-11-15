import { Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { ImageCarousel } from "@/components/image-carousel";
import { LoadFailed, loadFailure } from "@/components/load-failed";
import { SkeletonCard } from "@/components/skeleton";
import { DamageRecordIcon } from "@/components/damage-record-icon";
import { useGetTenancyDamageRecordsQuery } from "@/store/services/damage-api";
import type { DamageLevel } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { DamageRecordCard } from "./damage-record-card";

export type DamageLevelFilter = "ALL" | Exclude<DamageLevel, "NA">;

/** The level dropdown beside the search (user, 2026-11-14). `short` is what its pill shows. */
export const DAMAGE_LEVEL_OPTIONS: { label: string; short: string; value: DamageLevelFilter }[] = [
  { label: "All levels", short: "All", value: "ALL" },
  { label: "D1", short: "D1", value: "D1" },
  { label: "D2", short: "D2", value: "D2" },
  { label: "D3", short: "D3", value: "D3" },
];

/**
 * The damage records naming this tenant, on the owner's card (user,
 * 2026-11-10): the item, its level and code, the room, who it is charged to and
 * when, their share and where its bill stands. Under it, the photos, the
 * owner's note and the bill. There is no dispute in the app, they take it up
 * with the owner in person.
 */
export function TenantDamageRecords({ level = "ALL", search = "", tenancyId }: {
  /** Only records at this damage level. */
  level?: DamageLevelFilter;
  /** Matches the damage code (DMG-…) or the item's name, any case. */
  search?: string;
  tenancyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const query = useGetTenancyDamageRecordsQuery(tenancyId);
  const all = query.data ?? [];
  const needle = search.trim().toLowerCase();
  const records = all.filter((record) =>
    (level === "ALL" || record.damageLevel === level)
    && (!needle || record.code.toLowerCase().includes(needle) || record.itemName.toLowerCase().includes(needle)));
  const loadFailed = loadFailure(query);
  if (loadFailed) {
    return <LoadFailed error={loadFailed.error} onReload={loadFailed.reload} />;
  }
  if (query.isFetching && !query.data) {
    return <SkeletonCard />;
  }
  if (all.length === 0) {
    return <EmptyState artworkNode={<DamageRecordIcon size={80} />} title="No damage records" description="Nothing has been recorded against your stay." />;
  }
  if (records.length === 0) {
    return <EmptyState artworkNode={<DamageRecordIcon size={80} />} title="No matching records" description="Try another search or damage level." />;
  }

  return (
    <View style={{ gap: spacing.md }}>
      {records.map((record) => {
        const mine = record.shares.find((share) => share.tenancyId === tenancyId);
        const billed = Boolean(mine?.billCode) && mine?.billStatus !== "CANCELLED" && !mine?.waived;
        return (
          <DamageRecordCard key={record.id} record={record} viewerTenancyId={tenancyId}>
            {record.photoUrls.length > 0 || record.note ? (
              <View style={{ alignItems: "stretch", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, paddingTop: spacing.md }}>
                {record.photoUrls.length > 0 ? (
                  <View style={{ flexShrink: 0, width: 112 }}>
                    <ImageCarousel height={105} images={record.photoUrls} radius={radii.card} />
                  </View>
                ) : null}
                {record.note ? (
                  // The owner's note, the label in the box's border like Fix notes.
                  <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 8,
                    borderWidth: 1.5, flex: 1, minHeight: record.photoUrls.length > 0 ? 105 : undefined, minWidth: 0, padding: spacing.md }}>
                    <View pointerEvents="none" style={{ left: 10, position: "absolute", top: -9 }}>
                      <View style={{ backgroundColor: colors.surface, height: 8.25, left: 0, position: "absolute", right: 0, top: 0 }} />
                      <View style={{ backgroundColor: colors.surfaceSunken, bottom: 0, left: 0, position: "absolute", right: 0, top: 8.25 }} />
                      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.3, lineHeight: 16, paddingHorizontal: 5 }}>Owner's note</Text>
                    </View>
                    <Text style={[type.description, { color: colors.inkSoft }]}>{record.note}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={[type.caption, { color: colors.muted }]}>
              {billed ? `On bill ${mine?.billCode}` : mine?.waived ? "Your share was waived." : "Not billed yet. It may be charged when you move out."}
            </Text>
          </DamageRecordCard>
        );
      })}
    </View>
  );
}
