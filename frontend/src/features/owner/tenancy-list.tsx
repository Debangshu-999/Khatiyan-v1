import { Text, View } from "react-native";
import { BedDouble, CalendarDays, LogOut, UserRound, UserRoundMinus } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ActionButton } from "@/features/owner/owner-ui";
import { tenancyStatusLabel, type TenancySummary } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type OwnerTenancyListTab = "active" | "past";

export function TenancyListTabs({
  activeTab,
  onChange,
}: {
  activeTab: OwnerTenancyListTab;
  onChange: (tab: OwnerTenancyListTab) => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const tabs: { label: string; value: OwnerTenancyListTab }[] = [
    { label: "Active tenancies", value: "active" },
    { label: "Past tenancies", value: "past" },
  ];

  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", padding: 5 }}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.value;
        return (
          <AnimatedPressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={{
              alignItems: "center",
              backgroundColor: selected ? colors.surface : "transparent",
              borderColor: selected ? colors.borderStrong : "transparent",
              borderCurve: "continuous",
              borderRadius: 13,
              borderWidth: 1,
              flex: 1,
              justifyContent: "center",
              minHeight: 46,
            }}
          >
            <Text style={{ color: selected ? colors.ink : colors.muted, fontFamily: fonts.sans, fontSize: 14, fontWeight: selected ? "900" : "700" }}>
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/**
 * The card's only navigation: the tenant's name, opening their profile.
 *
 * <p>The name and the glyph are one target rather than the glyph alone. A 19px
 * icon is a small thing to hit on a phone, and the name beside it is the thing
 * a person is actually reaching for — so the row is the button and the glyph
 * is what marks it as one.
 *
 * <p>A bare solid glyph: no ring, no second icon. Composing a person with a
 * small eye inside a 32px ring put two marks in a space that fits one; they
 * overlapped and read as a smudge at the size the card actually renders.
 */
function TenantNameButton({ name, onPress }: { name: string; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={`View ${name}'s profile`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{ alignSelf: "flex-start", gap: 1 }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.display, fontSize: 21 }} numberOfLines={1}>
          {name}
        </Text>
        <UserRound color={colors.ink} fill={colors.ink} size={16} strokeWidth={1.6} />
      </View>
      {/* Named, not just marked. An icon beside a name says "there is something
          here" and leaves the reader to guess what tapping does — and this is
          the card's only tappable text, so nothing else teaches the gesture.
          Small and primary: an instruction, not a heading. */}
      <Text style={[type.caption, { color: colors.primary, fontSize: 11, fontWeight: "700" }]}>
        View profile
      </Text>
    </AnimatedPressable>
  );
}

export function ActiveTenancyCard({
  canEndTenancy = true,
  ending = false,
  onEndTenancy,
  onOpen,
  onRemove,
  removing = false,
  roomLabel,
  tenancy,
}: {
  ending?: boolean;
  // Ending a stay is Property stays at MANAGE. A view-only manager keeps the
  // card and the profile; the destructive action is absent, not disabled.
  canEndTenancy?: boolean;
  onEndTenancy: () => void;
  onOpen: () => void;
  /** Withdraws a tenancy the tenant never accepted. */
  onRemove?: () => void;
  removing?: boolean;
  roomLabel: string | null;
  tenancy: TenancySummary;
}) {
  const { colors, fonts, type } = useTheme();
  const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";
  const rentAmount = tenancy.billingType === "DAILY"
    ? tenancy.dailyRatePaise ?? tenancy.rentAmountPaise ?? 0
    : tenancy.rentAmountPaise ?? tenancy.dailyRatePaise ?? 0;
  const rentSuffix = tenancy.billingType === "DAILY" ? "/ day" : "/ month";
  // The exit scheduler only executes monthly approved exits; daily stays (and any
  // stay whose end date has slipped) need a manual close. Active daily stays keep
  // their checkout in plannedEndDate; monthly stays on notice carry it in endDate.
  // Enable the button on or after that date, and flag "Past due" once it has passed.
  const today = todayLocalISO();
  const endDate = tenancy.billingType === "DAILY" ? tenancy.plannedEndDate : tenancy.endDate;
  const canEnd = endDate != null && endDate <= today;
  const pastDue = endDate != null && endDate < today;
  // Only for a fixed term. An indefinite stay can carry an `endDate` too once
  // notice is served, but that is a pending exit rather than the agreed span,
  // and showing it as "Stay" would read as the term someone signed up for.
  const stayEndDate = tenancy.fixedTerm ? tenancy.endDate ?? tenancy.agreementEndDate : null;
  // Held at PENDING_ACCEPTANCE from onboarding until the tenant signs. The
  // tenancy's own status is the whole answer: acceptance and the expiry job both
  // move the agreement and the tenancy in one transaction, so this can never
  // disagree with the compliance record.
  const awaitingAgreement = tenancy.status === "PENDING_ACCEPTANCE";

  // Nothing on the card navigates except the profile button beside the name.
  // The card carries a destructive "End tenancy" action, and a large invisible
  // tap target wrapped around it meant a miss beside that button silently
  // navigated instead — so the affordance is now explicit and small.
  return (
    <Card>
      <View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <IconBox icon={BedDouble} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]}>
                  {tenancy.referenceCode}
                </Text>
                <TenantNameButton name={tenantName} onPress={onOpen} />
                <Text style={[type.caption, { color: colors.muted }]}>
                  {tenancy.tenantPhone || "Phone unavailable"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {/* Silent while the agreement is unsigned. "Pending agreement"
                    and "Agreement unsigned" are the same fact in two voices, and
                    stacking them made the card look like it was reporting two
                    different problems. The chip wins because it also says what
                    to do about it. */}
                {awaitingAgreement ? null : (
                  <Text style={[type.caption, { color: colors.primary, fontWeight: "900" }]}>
                    {tenancyStatusLabel(tenancy.status)}
                  </Text>
                )}
                {pastDue ? (
                  <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                    <Text style={{ color: colors.danger, fontFamily: fonts.sansBold, fontSize: 11, }}>
                      Past due
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <TenancyDetail label="Room" value={roomLabel ?? "Unavailable"} />
            <TenancyDetail label="Rent" value={`${formatMoneyPaise(rentAmount)} ${rentSuffix}`} />
            {/* A fixed term has both ends known from the day it starts, so the
                card states the span. An indefinite stay has no end to show —
                only where it began. */}
            {stayEndDate ? (
              <TenancyDetail
                label="Stay"
                value={`${formatDate(tenancy.startDate)} – ${formatDate(stayEndDate)}`}
              />
            ) : (
              <TenancyDetail label="Started" value={formatDate(tenancy.startDate)} />
            )}
          </View>
        </View>
      </View>

      {/* A stay that was never accepted cannot be "ended" — nothing started.
          The End button would sit permanently disabled under "Available once an
          end date is set", which is true and useless. Withdrawing it is the only
          thing anyone can do here, so that is the only thing offered. */}
      {canEndTenancy && awaitingAgreement && onRemove ? (
      <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={removing}
            icon={UserRoundMinus}
            label={removing ? "Removing…" : "Remove tenancy"}
            onPress={onRemove}
            variant="danger"
          />
        </View>

        {/* Beside the only thing anyone can do about it, rather than up in the
            header with the reference code. It is a task, not a status: nothing
            bills and nobody moves in until it is signed. */}
        <View style={{ alignItems: "flex-start" }}>
          <View
            style={{
              backgroundColor: colors.warningSoft,
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: colors.warningText, fontFamily: fonts.sansBold, fontSize: 11 }}>
              Agreement unsigned
            </Text>
          </View>
        </View>

        <Text style={[type.caption, { color: colors.muted }]}>
          Frees the bed. Nothing has been billed yet.
        </Text>
      </View>
      ) : canEndTenancy ? (
      <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
        <View style={{ flexDirection: "row" }}>
          <ActionButton
            disabled={!canEnd || ending}
            icon={LogOut}
            label={ending ? "Ending…" : "End tenancy"}
            onPress={onEndTenancy}
            variant="danger"
          />
        </View>
        {!canEnd ? (
          <Text style={[type.caption, { color: colors.muted }]}>
            {endDate ? `Can be ended on ${formatDate(endDate)}.` : "Available once an end date is set."}
          </Text>
        ) : null}
      </View>
      ) : null}
    </Card>
  );
}

export function PastTenancyCard({ roomLabel, tenancy }: { roomLabel: string | null; tenancy: TenancySummary }) {
  const { colors, fonts, type } = useTheme();
  const tenantName = tenancy.tenantName?.trim() || "Unnamed tenant";

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <IconBox icon={CalendarDays} muted />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                {tenancy.referenceCode}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, }} numberOfLines={1}>
                {tenantName}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {roomLabel ? `Room ${roomLabel}` : "Room unavailable"}
              </Text>
            </View>
            <Text style={[type.caption, { color: colors.muted, fontWeight: "900" }]}>
              {tenancyStatusLabel(tenancy.status)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TenancyDetail compact label="Started" value={formatDate(tenancy.startDate)} />
            <TenancyDetail compact label="Ended" value={tenancy.endDate ? formatDate(tenancy.endDate) : "No end date"} />
          </View>
        </View>
      </View>
    </Card>
  );
}

function IconBox({ icon: Icon, muted = false }: { icon: typeof BedDouble; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    // No tile. The pale blue fill was the last one of its kind in the app, and
    // with the border gone the glyph can take the space the box was holding.
    <View style={{ alignItems: "center", height: 42, justifyContent: "center", width: 42 }}>
      <Icon color={muted ? colors.muted : colors.ink} size={30} strokeWidth={1.8} />
    </View>
  );
}

function TenancyDetail({ compact = false, label, value }: { compact?: boolean; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: compact ? 1 : undefined, gap: 1 }}>
      <Text style={[type.caption, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

// Local calendar date as YYYY-MM-DD so it compares directly against the backend's
// ISO LocalDate strings (lexicographic order matches chronological order).
function todayLocalISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatMoneyPaise(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}