import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, MessageCircle } from "lucide-react-native";
import { useToast } from "@/components/toast";
import { useListMyRoommatesQuery } from "@/store/services/tenancy-api";
import { ChecklistArt } from "@/components/checklist-art";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { CalendarPageTile, FactColumn, FormCard } from "./request-form-cards";

/**
 * The Tenancy tab's stay and agreement cards (user, 2026-11-11): the four
 * fact tiles became one stay card with a timeline, and the agreement a full
 * card of its own.
 */

/** Days between two "YYYY-MM-DD" days. */
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Today in IST, "YYYY-MM-DD". */
function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
}

/**
 * The stay from start to end: two calendar pages joined by a line that fills as
 * the days pass, how far in the tenant is, and the billing and term under it.
 */
export function StayTimelineCard({
  billing,
  endDate,
  startDate,
  term,
  deposit,
}: {
  billing: string;
  /** The day it ends, or null for an open stay. */
  endDate: string | null;
  startDate: string;
  term: string;
  deposit: string;
}) {
  const { colors, fonts, type } = useTheme();
  const today = todayIst();
  const stayed = Math.max(0, daysBetween(startDate, today));
  const length = endDate ? Math.max(1, daysBetween(startDate, endDate)) : null;
  const progress = length ? Math.min(1, stayed / length) : null;
  const left = endDate ? Math.max(0, daysBetween(today, endDate)) : null;

  return (
    <FormCard>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <CalendarPageTile iso={startDate} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.caption, { color: colors.muted }]}>Moved in</Text>
            <Text style={[type.caption, { color: colors.muted }]}>{endDate ? "Moving out" : "No end date"}</Text>
          </View>
          {/* The line between the two days, filled as far as today. */}
          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 8, overflow: "hidden" }}>
            <LinearGradient
              colors={["#3E63DD", "#5B4BD6"]}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={{ borderRadius: 999, height: 8, width: progress == null ? "100%" : `${Math.max(4, progress * 100)}%`, opacity: progress == null ? 0.35 : 1 }}
            />
          </View>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13, textAlign: "center" }}>
            {`Day ${stayed + 1}${left != null ? `, ${left} ${left === 1 ? "day" : "days"} to go` : " of your stay"}`}
          </Text>
        </View>
        <CalendarPageTile iso={endDate} unset />
      </View>
      <View style={{ backgroundColor: colors.border, height: 1 }} />
      <View style={{ flexDirection: "row" }}>
        <FactColumn label="Billing" value={billing} />
        <FactColumn divided label="Agreement" value={term} />
        <FactColumn divided label="Deposit" value={deposit} />
      </View>
    </FormCard>
  );
}

/** A signed page with a seal, the agreement's own drawing. */
export function AgreementDrawing({ onLight = false, size = 96 }: { /** On a white tile: a blue back sheet and an outlined page (2026-11-11). */ onLight?: boolean; size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 96 96" width={size}>
      <Defs>
        <SvgGradient id="agreementSeal" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFD36B" />
          <Stop offset="1" stopColor="#F59E0B" />
        </SvgGradient>
      </Defs>
      <Rect fill={onLight ? "#C9D6F7" : "rgba(255, 255, 255, 0.18)"} height={70} rx={8} transform="rotate(-8 40 46)" width={52} x={14} y={12} />
      <Rect fill="#FFFFFF" height={70} rx={8} stroke={onLight ? "#9DB1E8" : "none"} strokeWidth={onLight ? 2 : 0} width={52} x={22} y={12} />
      <Path d="M31 26 H62 M31 34 H62 M31 42 H55 M31 50 H60" stroke="#C9D3F0" strokeLinecap="round" strokeWidth={3} />
      {/* The signature. */}
      <Path d="M31 66 C35 58, 39 72, 43 63 S50 60, 53 66" fill="none" stroke="#3E63DD" strokeLinecap="round" strokeWidth={2.4} />
      <Circle cx={70} cy={70} fill="url(#agreementSeal)" r={14} />
      <Circle cx={70} cy={70} fill="none" r={9.5} stroke="#FFFFFF" strokeWidth={1.6} />
      <Path d="M65.5 70 L69 73.5 L75 66.5" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
    </Svg>
  );
}

/**
 * The agreement, a card of its own (user, 2026-11-11): a deep gradient with
 * soft circles, the signed page and its seal, the term and the way in.
 */
export function AgreementHeroCard({
  actionLabel = "View agreement",
  badge = "Signed",
  drawingFirst = false,
  onView,
  term,
  termNote,
  title = "Your agreement",
}: {
  /** The owner's Tenancy control uses the same card with its own words (user, 2026-11-14). */
  actionLabel?: string;
  badge?: string;
  /** The drawing on the left, so a long title keeps the width (user, 2026-11-14: the owner's card). */
  drawingFirst?: boolean;
  onView: () => void;
  /** Optional: the owner's card is the chip and the title only. */
  term?: string;
  termNote?: string;
  title?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ borderRadius: radii.card, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={["#1E2A78", "#3E4FC9", "#6A4FD8"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        // The tall card only with its term lines. Title-only (the owner's), it fits its content,
        // no empty space under the button (user, 2026-11-14).
        style={{ borderCurve: "continuous", borderRadius: radii.card, gap: term || termNote ? spacing.lg : spacing.md, minHeight: term || termNote ? 220 : undefined, overflow: "hidden", padding: spacing.lg }}
      >
        <View pointerEvents="none" style={{ backgroundColor: "rgba(255, 255, 255, 0.07)", borderRadius: 999, height: 180, position: "absolute", right: -60, top: -60, width: 180 }} />
        <View pointerEvents="none" style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", borderRadius: 999, bottom: -50, height: 140, left: -40, position: "absolute", width: 140 }} />
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          {drawingFirst ? <AgreementDrawing /> : null}
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255, 255, 255, 0.16)", borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 }}>
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 11.5 }}>{badge}</Text>
            </View>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }}>{title}</Text>
            {term ? <Text style={{ color: "rgba(255, 255, 255, 0.85)", fontFamily: fonts.sansBold, fontSize: 15 }}>{term}</Text> : null}
            {termNote ? <Text style={{ color: "rgba(255, 255, 255, 0.72)", fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 17 }}>{termNote}</Text> : null}
          </View>
          {drawingFirst ? null : <AgreementDrawing />}
        </View>
        <AnimatedPressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onView}
          style={{ alignItems: "center", backgroundColor: "#FFFFFF", borderCurve: "continuous", borderRadius: radii.card, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 46 }}
        >
          <Text style={{ color: "#1E2A78", fontFamily: fonts.sansBold, fontSize: 14 }}>{actionLabel}</Text>
          <ChevronRight color="#1E2A78" size={17} strokeWidth={2.4} />
        </AnimatedPressable>
      </LinearGradient>
    </View>
  );
}

/**
 * The move-in checklist as a half-width tile, built like the owner's wallet
 * tile (user, 2026-11-11): the drawing top left and its state top right where
 * the wallet has its arrow, then the name and one short line. Green once
 * accepted, yellow while it waits on the tenant.
 */
export function MoveInChecklistCard({ onPress, status }: { onPress: () => void; status: "WAITING" | "NOTED" | "ACCEPTED" }) {
  const { colors, fonts } = useTheme();
  const accepted = status === "ACCEPTED";
  const palette = accepted
    ? { border: "#A6F4C5", colors: ["#ECFDF3", "#D1FADF"] as const, mark: "#079455", note: "#067647" }
    : { border: "#FEDF89", colors: ["#FFFAEB", "#FEF0C7"] as const, mark: "#DC6803", note: "#B54708" };
  const note = accepted ? "Accepted" : status === "NOTED" ? "You noted a difference" : "Waiting for your answer";
  return (
    <AnimatedPressable accessibilityLabel={`Move-in checklist, ${note}`} accessibilityRole="button" onPress={onPress} style={{ flex: 1 }}>
      <View style={{ borderRadius: radii.card, flex: 1, ...cardShadow(colors.shadow) }}>
        <LinearGradient
          colors={palette.colors}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={{ borderColor: palette.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flex: 1, gap: spacing.sm, minHeight: 132, padding: spacing.md }}
        >
          <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
            <ChecklistArt pending={!accepted} size={48} />
            {/* An arrow, as on the owner's wallet tile (user, 2026-11-11). */}
            <ChevronRight color={palette.note} size={20} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, gap: 2, justifyContent: "flex-end" }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>Move-in checklist</Text>
            <Text numberOfLines={1} style={{ color: palette.note, fontFamily: fonts.sansBold, fontSize: 12.5, lineHeight: 16 }}>{note}</Text>
          </View>
        </LinearGradient>
      </View>
    </AnimatedPressable>
  );
}

const ROOMMATE_COLOURS = ["#5B7CFA", "#B46CF0", "#F08A5B", "#34C3B0", "#E5484D"];

/**
 * Your roommates, beside the move-in checklist (user, 2026-11-11): one person
 * at a time, swiped for the rest in a triple or bigger room, each with a Chat
 * button that is not wired yet.
 */
export function RoommatesCard() {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const query = useListMyRoommatesQuery();
  const roommates = query.data ?? [];
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);

  return (
    <View style={{ borderRadius: radii.card, flex: 1, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={["#EEF2FF", "#F1E8FF"]}
        end={{ x: 1, y: 1 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width - 2)}
        start={{ x: 0, y: 0 }}
        style={{ borderColor: "#D9D6FE", borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flex: 1, minHeight: 132, overflow: "hidden", paddingVertical: spacing.md }}
      >
        {query.isLoading ? null : roommates.length === 0 ? (
          // Empty, laid out like the checklist tile: the drawing, then the name and one line.
          <View style={{ flex: 1, gap: spacing.sm, paddingHorizontal: spacing.md }}>
            <RoommatesArt empty />
            <View style={{ flex: 1, gap: 2, justifyContent: "flex-end" }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21 }}>Your roommates</Text>
              <Text numberOfLines={1} style={{ color: "#6941C6", fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 }}>No roommates yet</Text>
            </View>
          </View>
        ) : width > 0 ? (
          <>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 21, paddingHorizontal: spacing.md }}>Your roommates</Text>
            <ScrollView
              horizontal
              onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginTop: spacing.sm }}
            >
              {roommates.map((mate, index) => (
                <View key={mate.tenancyId} style={{ gap: spacing.sm, paddingHorizontal: spacing.md, width }}>
                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ alignItems: "center", backgroundColor: ROOMMATE_COLOURS[index % ROOMMATE_COLOURS.length], borderRadius: 999, height: 34, justifyContent: "center", width: 34 }}>
                      <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 14 }}>{mate.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{mate.name}</Text>
                      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontSize: 11 }]}>Since {monthYear(mate.since)}</Text>
                    </View>
                  </View>
                  {/* Not wired yet: says so (user, 2026-11-11). */}
                  <AnimatedPressable
                    accessibilityLabel={`Chat with ${mate.name}`}
                    accessibilityRole="button"
                    onPress={() => toast.info("Chat with roommates is coming soon.")}
                    style={{ alignItems: "center", borderColor: colors.primary, borderRadius: radii.card, borderWidth: 1.5, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 32 }}
                  >
                    <MessageCircle color={colors.primary} size={14} strokeWidth={2.4} />
                    <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12.5 }}>Chat</Text>
                  </AnimatedPressable>
                </View>
              ))}
            </ScrollView>
            {roommates.length > 1 ? (
              <View style={{ flexDirection: "row", gap: 4, justifyContent: "center", marginTop: spacing.sm }}>
                {roommates.map((mate, index) => (
                  <View key={mate.tenancyId} style={{ backgroundColor: index === page ? colors.primary : colors.borderStrong, borderRadius: 999, height: 5, width: index === page ? 12 : 5 }} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </LinearGradient>
    </View>
  );
}

/**
 * Two people, the roommates drawing (user, 2026-11-11). Empty: one person and
 * a dashed outline where a roommate would be.
 */
function RoommatesArt({ empty = false }: { empty?: boolean }) {
  return (
    <Svg height={48} viewBox="0 0 48 48" width={48}>
      <Defs>
        <SvgGradient id="mateOne" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#7C8DFF" />
          <Stop offset="1" stopColor="#4B5FE0" />
        </SvgGradient>
        <SvgGradient id="mateTwo" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#C38BF5" />
          <Stop offset="1" stopColor="#8E4FD9" />
        </SvgGradient>
      </Defs>
      {/* The one behind: a roommate, or the dashed place for one. */}
      {empty ? (
        <>
          <Circle cx={32} cy={15} fill="none" r={6} stroke="#9E77ED" strokeDasharray="3 2.5" strokeWidth={1.6} />
          <Path d="M 22 38 a 10 10 0 0 1 20 0" fill="none" stroke="#9E77ED" strokeDasharray="3 2.5" strokeLinecap="round" strokeWidth={1.6} />
        </>
      ) : (
        <>
          <Circle cx={32} cy={15} fill="url(#mateTwo)" r={6} />
          <Path d="M 22 38 a 10 10 0 0 1 20 0 Z" fill="url(#mateTwo)" />
        </>
      )}
      {/* The tenant, in front. */}
      <Circle cx={18} cy={19} fill="#FFFFFF" r={8.2} />
      <Circle cx={18} cy={19} fill="url(#mateOne)" r={6.8} />
      <Path d="M 5 44 a 13 13 0 0 1 26 0 Z" fill="#FFFFFF" />
      <Path d="M 6.5 44 a 11.5 11.5 0 0 1 23 0 Z" fill="url(#mateOne)" />
    </Svg>
  );
}

function monthYear(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(`${iso}T12:00:00+05:30`));
}
