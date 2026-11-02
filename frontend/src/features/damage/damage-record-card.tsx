import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FitText } from "@/components/fit-text";
import { ImageCarousel } from "@/components/image-carousel";
import { formatMoneyPaise } from "@/features/owner/owner-ui";
import { ItemIcon } from "@/features/property/item-icon";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { cardName } from "@/lib/person-name";
import { useAppSelector } from "@/store/hooks";
import type { DamageRecord } from "@/store/services/damage-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { useSoftShadow } from "@/theme/shadows";

/** Where a record's money stands, in a tint and a caps label, no dot. */
export function damageBillState(record: DamageRecord): { label: string; tone: "muted" | "warning" | "success" } {
  if (record.responsibility === "NONE") return { label: "No charge", tone: "muted" };
  if (!record.charged) return { label: "Not charged", tone: "muted" };
  if (record.shares.every((share) => share.waived)) return { label: "Waived", tone: "muted" };
  if (record.shares.every((share) => !share.billId && (share.waived || share.depositPaise > 0))) return { label: "From deposit", tone: "success" };
  if (record.shares.every((share) => share.billStatus === "PAID")) return { label: "Billed · paid", tone: "success" };
  return { label: "Billed · unpaid", tone: "warning" };
}

/** The item, and which split of the damage this is if it was split. */
export function damageRecordName(record: DamageRecord) {
  return record.splitNumber ? `${record.itemName}, split ${record.splitNumber}` : record.itemName;
}

/** Who answers for it, the way a card says it. */
export function damageResponsible(record: DamageRecord) {
  if (record.responsibility === "NONE") return record.source === "MOVE_IN" ? "Found at move-in" : "Nobody";
  return cardName(record.shares[0]?.tenantName ?? "Tenant");
}

export function dayMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function StatePill({ label, tone }: { label: string; tone: "muted" | "warning" | "success" }) {
  const { colors, fonts } = useTheme();
  const fill = tone === "success" ? colors.jadeSoft : tone === "warning" ? colors.accentSoft : colors.surfaceSunken;
  const ink = tone === "success" ? colors.jade : tone === "warning" ? colors.accent : colors.inkSoft;
  return (
    <View style={{ backgroundColor: fill, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <Text style={{ color: ink, fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

/**
 * One damage record, a card of its own on the Damages screen (2026-10-29): the
 * item, its level and code, the room and who answers for it, the cost and
 * where the money stands. Tapping it opens its bills and actions. Its repair
 * buttons sit under it, as {@code children}.
 */
export function DamageRecordCard({ children, onPress, record }: { children?: React.ReactNode; onPress?: () => void; record: DamageRecord }) {
  const { colors, fonts, type } = useTheme();
  const softShadow = useSoftShadow();
  const state = damageBillState(record);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.lg,
        ...softShadow(colors.shadow, 4, 12),
      }}
    >
    <AnimatedPressable
      accessibilityLabel={`${damageRecordName(record)}, ${record.damageLevel}, ${record.code}`}
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={{ gap: spacing.xs }}
    >
      {/* The item and its code on the left, its level at the top right (user, 2026-10-29). */}
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ marginTop: 2 }}><ItemIcon color={colors.inkSoft} name={record.itemName} size={20} /></View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <FitText style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, transform: [{ translateY: -2 }] }}>{damageRecordName(record)}</FitText>
          <Text style={[type.caption, { color: colors.muted }]}>{record.code}</Text>
        </View>
        <DamageLevelPill level={record.damageLevel} />
      </View>
      {/* The tenancy card's labelled, divided metric row, not one compressed sentence. */}
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <View style={{ alignItems: "stretch", flexDirection: "row" }}>
          <DamageRecordMetric flex={0.75} label="Room" value={record.roomLabel ?? "Unavailable"} />
          <DamageRecordMetricDivider />
          <DamageRecordMetric flex={1.6}
            label={record.responsibility === "NONE" ? "Responsibility" : "Tenant"}
            value={damageResponsible(record)} />
          <DamageRecordMetricDivider />
          <DamageRecordMetric flex={1} label="Recorded" value={dayMonth(record.createdAt)} />
        </View>
        <View style={{ backgroundColor: colors.border, height: 1 }} />
      </View>
      {record.responsibility === "NONE" ? null : (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xs, paddingTop: spacing.xs }}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={[type.caption, { color: colors.muted, fontSize: 10 }]}>Amount</Text>
            <FitText numberOfLines={1} minimumFontScale={0.8}
              style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] }}>
              {formatMoneyPaise(record.costPaise)}
            </FitText>
          </View>
          <StatePill label={state.label} tone={state.tone} />
        </View>
      )}
    </AnimatedPressable>
    {children}
    </View>
  );
}

/** The same record card, with its repair outcome and evidence instead of repair actions. */
export function DamageRepairHistoryCard({ record }: { record: DamageRecord }) {
  const { colors, fonts, type } = useTheme();
  const account = useAppSelector((state) => state.auth.user);
  const doneBy = account?.id && record.repairedByUserId === account.id ? "Self" : record.repairedByName ? cardName(record.repairedByName) : "—";
  const photos = record.repairPhotoUrls ?? [];
  return (
    <DamageRecordCard record={record}>
      <View style={{ borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.md, paddingTop: spacing.md }}>
        {photos.length > 0 || record.repairNote ? (
          <View style={{ alignItems: "stretch", flexDirection: "row", gap: spacing.sm }}>
            {photos.length > 0 ? (
              <View style={{ flexShrink: 0, width: 112 }}>
                <ImageCarousel height={105} images={photos} radius={radii.card} />
              </View>
            ) : null}
            {record.repairNote ? (
              <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 8,
                borderWidth: 1.5, flex: 1, minHeight: photos.length > 0 ? 105 : undefined, minWidth: 0, padding: spacing.md }}>
                <View pointerEvents="none" style={{ left: 10, position: "absolute", top: -9 }}>
                  <View style={{ backgroundColor: colors.surface, height: 8.25, left: 0, position: "absolute", right: 0, top: 0 }} />
                  <View style={{ backgroundColor: colors.surfaceSunken, bottom: 0, left: 0, position: "absolute", right: 0, top: 8.25 }} />
                  <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.3, lineHeight: 16, paddingHorizontal: 5 }}>Fix notes</Text>
                </View>
                <Text selectable={false} style={[type.description, { color: colors.inkSoft }]}>{record.repairNote}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ alignItems: "stretch", borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", paddingVertical: spacing.sm }}>
          <DamageRecordMetric flex={1} label="Action" value={record.status === "REPAIRED" ? "Repaired" : "Replaced"} />
          <DamageRecordMetricDivider />
          <DamageRecordMetric flex={1} label="New level" value={<DamageLevelPill level={record.repairedLevel ?? "NA"} />} />
          <DamageRecordMetricDivider />
          <DamageRecordMetric flex={1} label="Date" value={record.repairedAt ? dayMonth(record.repairedAt) : "—"} />
        </View>
        <Text selectable={false} style={[type.caption, { color: colors.muted, marginTop: -spacing.xs }]}>Done by: {doneBy}</Text>
      </View>
    </DamageRecordCard>
  );
}

/** Matches TenancyMetric's typography and flexible columns, including long names. */
function DamageRecordMetric({ flex, label, value }: { flex: number; label: string; value: string | React.ReactElement }) {
  const { colors, fonts, type } = useTheme();
  return <View style={{ flex, gap: 3, minWidth: 0, paddingHorizontal: spacing.xs }}>
    <FitText numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 10 }]}>{label}</FitText>
    {typeof value === "string" ? <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16 }}>{value}</FitText> : <View style={{ alignSelf: "flex-start" }}>{value}</View>}
  </View>;
}

function DamageRecordMetricDivider() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, marginHorizontal: spacing.xxs, width: 1 }} />;
}
