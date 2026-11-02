import { Image, Text, View } from "react-native";

import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { Card } from "@/components/card";
import { FitText } from "@/components/fit-text";
import { Section } from "@/components/section";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { ItemIcon } from "@/features/property/item-icon";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { useGetTenancyDamageRecordsQuery } from "@/store/services/damage-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { StatePill, dayMonth, damageRecordName } from "./damage-record-card";

/**
 * The damage records naming this tenant (user, 2026-10-29): the item, its
 * level, their share, photos and note, and their bill. There is no dispute in
 * the app, they take it up with the owner in person. Hidden when there are none.
 */
export function TenantDamageRecords({ tenancyId }: { tenancyId: string }) {
  const { colors, fonts, type } = useTheme();
  const query = useGetTenancyDamageRecordsQuery(tenancyId);
  const records = query.data ?? [];
  const loadFailed = loadFailure(query);
  if (loadFailed) {
    return <LoadFailedCard error={loadFailed.error} onReload={loadFailed.reload} />;
  }

  if (records.length === 0) return null;

  return (
    <Section title="Damage records">
      <View style={{ gap: spacing.md }}>
        {records.map((record) => {
          const mine = record.shares.find((share) => share.tenancyId === tenancyId);
          const billState = mine?.waived
            ? { label: "Waived", tone: "muted" as const }
            : mine && mine.amountPaise > 0 && mine.depositPaise >= mine.amountPaise
            ? { label: "From deposit", tone: "success" as const }
            : !mine?.billCode || mine.billStatus === "CANCELLED"
            ? null
            : mine.billStatus === "PAID" ? { label: "Paid", tone: "success" as const } : { label: "Unpaid", tone: "warning" as const };
          return (
            <Card key={record.id}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <ItemIcon color={colors.inkSoft} name={record.itemName} size={20} />
                <FitText style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.display, fontSize: 16 }}>{damageRecordName(record)}</FitText>
                <DamageLevelPill level={record.damageLevel} />
                <View style={{ flex: 1 }} />
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{formatMoneyPaise(mine?.amountPaise ?? 0)}</Text>
              </View>
              <FitText style={[type.description, { color: colors.muted }]}>
                {`Recorded ${dayMonth(record.createdAt)} by the owner · ${record.code}`}
              </FitText>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                {record.photoUrls.slice(0, 3).map((url) => (
                  <Image key={url} resizeMode="cover" source={{ uri: url }} style={{ borderRadius: radii.card, height: 56, width: 56 }} />
                ))}
                {record.note ? <Text style={[type.description, { color: colors.inkSoft, flex: 1 }]}>{record.note}</Text> : null}
              </View>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
                  {billState ? `On bill ${mine?.billCode}` : "Not billed yet. It may be charged when you move out."}
                </Text>
                {billState ? <StatePill label={billState.label} tone={billState.tone} /> : null}
              </View>
            </Card>
          );
        })}
      </View>
    </Section>
  );
}
