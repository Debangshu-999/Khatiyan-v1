import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { ChevronRight, Clock, Lock } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { PriorityChip, PriorityMark, priorityLabel } from "@/features/notice/notice-ui";
import type { NoticePriority, NoticeSummary } from "@/store/services/notice-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { MegaphoneIcon } from "@/components/megaphone-icon";

/** The megaphone, the notice board's own picture (the property board has the cork). */
export const NOTICE_BOARD_ARTWORK = require("../../../assets/icons/workspace/notice-module.png");

/**
 * The notice board's colours (user, 2026-11-10): the property board is cork,
 * this one a deep blue board with paper notices taped to it.
 */
export const NOTICE_BOARD = {
  colors: ["#2F55D4", "#2443B0", "#1A318A"] as const,
  frame: "#132563",
  speck: "rgba(255, 255, 255, 0.07)",
  ink: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.78)",
  paper: "#FFFFFF",
  paperEdge: "#DCE3F5",
  paperInk: "#101A3A",
  paperMuted: "#56607A",
};

/** Three of the property board's notes and the gaps between them. */
const THREE_NOTES_HEIGHT = 3 * 58 + 2 * spacing.md;

/** Tape colour by how loud the notice is. */
const TAPE: Record<NoticePriority, string> = {
  EMERGENCY: "rgba(229, 72, 77, 0.85)",
  URGENT: "rgba(245, 140, 36, 0.85)",
  IMPORTANT: "rgba(245, 197, 36, 0.85)",
  NORMAL: "rgba(167, 196, 255, 0.9)",
};

/** Board specks, fixed so it looks the same on every render. */
const SPECKS = Array.from({ length: 36 }, (_, index) => ({
  left: `${(index * 41 + 5) % 97}%` as const,
  size: 2 + (index % 3),
  top: `${(index * 59 + 13) % 95}%` as const,
}));

/** The blue board itself: gradient, frame and specks behind its children. */
export function NoticeBoardSurface({ children, fill = false }: { children: React.ReactNode; /** Grow to the carousel row's height. */ fill?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: radii.card, flex: fill ? 1 : undefined, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={NOTICE_BOARD.colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          borderColor: NOTICE_BOARD.frame,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 4,
          flex: fill ? 1 : undefined,
          gap: spacing.md,
          overflow: "hidden",
          padding: spacing.md,
        }}
      >
        {SPECKS.map((speck, index) => (
          <View
            key={index}
            pointerEvents="none"
            style={{
              backgroundColor: NOTICE_BOARD.speck,
              borderRadius: 999,
              height: speck.size,
              left: speck.left,
              position: "absolute",
              top: speck.top,
              width: speck.size,
            }}
          />
        ))}
        {children}
      </LinearGradient>
    </View>
  );
}

/**
 * A soft white light behind the megaphone, so the blue icon does not sink into
 * the blue board (user, 2026-11-10). A radial fade, not a hard disc.
 */
function MegaphoneGlow({ size }: { size: number }) {
  const glow = size * 1.7;
  return (
    <View style={{ alignItems: "center", height: size, justifyContent: "center", width: size }}>
      <Svg height={glow} pointerEvents="none" style={{ position: "absolute" }} width={glow}>
        <Defs>
          <RadialGradient cx="50%" cy="50%" id="megaphoneGlow" r="50%">
            {/* Soft, a halo around the drawing rather than a disc over it (user, 2026-11-14). */}
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={glow / 2} cy={glow / 2} fill="url(#megaphoneGlow)" r={glow / 2} />
      </Svg>
      {/* The colour vector megaphone, as on Home's card (user, 2026-11-14), positioned so
          it paints in front of the glow: an absolute sibling otherwise draws over it. */}
      <View style={{ position: "relative", zIndex: 1 }}>
        <MegaphoneIcon size={size} />
      </View>
    </View>
  );
}

function Tape({ priority }: { priority: NoticePriority }) {
  return (
    <View
      pointerEvents="none"
      style={{
        alignSelf: "center",
        backgroundColor: TAPE[priority],
        borderRadius: 2,
        height: 12,
        position: "absolute",
        top: -6,
        transform: [{ rotate: "-3deg" }],
        width: 46,
      }}
    />
  );
}

/** Tenant Home's notice board: notices taped to a blue board, one line each. */
export function NoticeBoardHomeCard({
  fill,
  lockedText,
  noticeCount,
  notices,
  onPress,
}: {
  fill?: boolean;
  /** Set while notices are closed to this person: shown in place of the notices. */
  lockedText?: string;
  noticeCount: number;
  notices: NoticeSummary[];
  onPress?: () => void;
}) {
  const { fonts, type } = useTheme();
  const pressable = Boolean(onPress);

  return (
    <NoticeBoardSurface fill={fill}>
      <AnimatedPressable
        accessibilityHint="Opens every notice"
        accessibilityLabel="Open notice board"
        accessibilityRole="button"
        disabled={!pressable}
        onPress={onPress}
        style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}
      >
        {/* The same megaphone, on the meal card's disc in place of its glow (user,
            2026-11-14): see-through white with a white edge. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 255, 0.16)",
            borderColor: "rgba(255, 255, 255, 0.45)",
            borderRadius: 999,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          {/* A colour vector megaphone: the 3D drawing was nearly lost on the blue (user, 2026-11-14). */}
          <MegaphoneIcon size={30} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <FitText
            minimumFontScale={0.8}
            numberOfLines={1}
            style={[type.display, { color: NOTICE_BOARD.ink, fontSize: 22, lineHeight: 27 }]}
          >
            Notice board
          </FitText>
          {notices.length > 0 ? (
            <Text style={{ color: NOTICE_BOARD.muted, fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
              {noticeCount} live {noticeCount === 1 ? "notice" : "notices"}
            </Text>
          ) : null}
        </View>
        {pressable ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: NOTICE_BOARD.paper,
              borderRadius: 999,
              height: 32,
              justifyContent: "center",
              width: 32,
            }}
          >
            <ChevronRight color={NOTICE_BOARD.paperInk} size={18} strokeWidth={2.2} />
          </View>
        ) : null}
      </AnimatedPressable>

      {lockedText ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
          <Lock color={NOTICE_BOARD.ink} size={15} strokeWidth={2.2} />
          <Text style={[type.body, { color: NOTICE_BOARD.ink }]}>{lockedText}</Text>
        </View>
      ) : notices.length > 0 ? (
        <View style={{ gap: spacing.md, paddingTop: 2 }}>
          {notices.map((notice) => (
            <AnimatedPressable
              accessibilityLabel={`${priorityLabel(notice.priority)} notice: ${notice.title}`}
              accessibilityRole="button"
              key={notice.id}
              onPress={onPress}
              style={{
                backgroundColor: NOTICE_BOARD.paper,
                borderColor: NOTICE_BOARD.paperEdge,
                borderCurve: "continuous",
                borderRadius: 6,
                borderWidth: 1,
                gap: 2,
                minHeight: 58,
                paddingBottom: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.sm + 2,
                ...softShadow("rgba(5, 15, 60, 0.35)", 2, 5),
              }}
            >
              <Tape priority={notice.priority} />
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                {notice.priority !== "NORMAL" ? <PriorityMark priority={notice.priority} size={14} /> : null}
                {/* One line each, cut with an ellipsis, never shrunk. */}
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={{ color: NOTICE_BOARD.paperInk, flex: 1, fontFamily: fonts.displaySoft, fontSize: 14.5, lineHeight: 19 }}
                >
                  {notice.title}
                </Text>
              </View>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={{ color: NOTICE_BOARD.paperMuted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17 }}
              >
                {notice.body}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      ) : (
        <NoNoticesNote tall />
      )}
    </NoticeBoardSurface>
  );
}

/**
 * Nothing posted: a blank white notice taped to the board, its ruled lines
 * empty (user, 2026-11-10). Drawn, not the empty-state picture.
 */
export function NoNoticesNote({ tall = false }: {
  /**
   * Home's board: as tall as three of the property board's notes, the message
   * centred in it, so the two boards in the carousel match (user, 2026-11-10).
   */
  tall?: boolean;
}) {
  const { fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: NOTICE_BOARD.paper,
        borderColor: NOTICE_BOARD.paperEdge,
        borderCurve: "continuous",
        borderRadius: 6,
        borderWidth: 1,
        flex: tall ? 1 : undefined,
        flexDirection: tall ? "column" : "row",
        gap: spacing.md,
        justifyContent: tall ? "center" : undefined,
        minHeight: tall ? THREE_NOTES_HEIGHT : undefined,
        marginTop: 2,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        ...softShadow("rgba(5, 15, 60, 0.35)", 2, 5),
      }}
    >
      <Tape priority="NORMAL" />
      {/* A tiny blank sheet: a folded corner and ruled lines with nothing on them. */}
      <View
        style={{
          backgroundColor: "#F4F7FE",
          borderColor: NOTICE_BOARD.paperEdge,
          borderRadius: 4,
          borderWidth: 1,
          gap: tall ? 7 : 5,
          height: tall ? 72 : 52,
          justifyContent: "center",
          overflow: "hidden",
          paddingHorizontal: tall ? 10 : 7,
          width: tall ? 60 : 44,
        }}
      >
        {[0.85, 0.65, 0.8, 0.5].map((width, index) => (
          <View
            key={index}
            style={{ backgroundColor: "#D3DCF2", borderRadius: 2, height: tall ? 4 : 3, width: `${width * 100}%` }}
          />
        ))}
        <View
          style={{
            backgroundColor: NOTICE_BOARD.paperEdge,
            borderBottomLeftRadius: 3,
            height: 10,
            position: "absolute",
            right: 0,
            top: 0,
            width: 10,
          }}
        />
      </View>
      <View style={{ alignItems: tall ? "center" : undefined, flex: tall ? undefined : 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: NOTICE_BOARD.paperInk, fontFamily: fonts.displaySoft, fontSize: tall ? 16 : 15, lineHeight: tall ? 21 : 20 }}>
          No notices right now
        </Text>
      </View>
    </View>
  );
}

/**
 * The notice screen's banner, where the property board shows its cork photo:
 * the blue board with the megaphone pinned in the middle.
 */
export function NoticeBoardHero() {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.description, { color: colors.muted }]}>
        Announcements from your property team.
      </Text>
      <NoticeBoardSurface>
        <View style={{ alignItems: "center", aspectRatio: 1.9, justifyContent: "center" }}>
          {/* Two blank slips taped either side, so it reads as a board. */}
          <View style={{ backgroundColor: NOTICE_BOARD.paper, borderRadius: 4, height: "46%", left: "4%", opacity: 0.9, position: "absolute", top: "14%", transform: [{ rotate: "-5deg" }], width: "24%" }}>
            <Tape priority="IMPORTANT" />
            <View style={{ gap: 6, padding: 10, paddingTop: 14 }}>
              {[0.9, 0.7, 0.8, 0.5].map((w, i) => <View key={i} style={{ backgroundColor: NOTICE_BOARD.paperEdge, borderRadius: 2, height: 5, width: `${w * 100}%` }} />)}
            </View>
          </View>
          <View style={{ backgroundColor: NOTICE_BOARD.paper, borderRadius: 4, bottom: "10%", height: "40%", opacity: 0.9, position: "absolute", right: "5%", transform: [{ rotate: "4deg" }], width: "24%" }}>
            <Tape priority="EMERGENCY" />
            <View style={{ gap: 6, padding: 10, paddingTop: 14 }}>
              {[0.8, 0.6, 0.85].map((w, i) => <View key={i} style={{ backgroundColor: NOTICE_BOARD.paperEdge, borderRadius: 2, height: 5, width: `${w * 100}%` }} />)}
            </View>
          </View>
          <MegaphoneGlow size={104} />
        </View>
      </NoticeBoardSurface>
    </View>
  );
}

const GROUP_LABEL: Record<NoticePriority, string> = {
  EMERGENCY: "Emergency",
  URGENT: "Urgent",
  IMPORTANT: "Important",
  NORMAL: "General",
};

const IST_DAY = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric" });
const IST_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const IST_TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * One list, newest first (user, 2026-11-15): no grouping by priority or by day, since
 * a notice stays up for days. Each card carries its own date instead.
 */
export function sortNoticesNewestFirst(notices: NoticeSummary[]): NoticeSummary[] {
  return [...notices].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** "Today · 9:42 am" for today's notices, "12 Nov" for older ones (user, 2026-11-15). */
export function noticeCardDate(publishedAt: string, now: number = Date.now()): string {
  const when = new Date(publishedAt);
  return IST_DAY.format(when) === IST_DAY.format(new Date(now))
    ? `Today · ${IST_TIME.format(when)}`
    : IST_DATE.format(when);
}

export function noticeGroupLabel(priority: NoticePriority) {
  return GROUP_LABEL[priority];
}

type ToneColors = ReturnType<typeof useTheme>["colors"];
const PRIORITY_TONE = (colors: ToneColors): Record<NoticePriority, { fill: string; ink: string }> => ({
  EMERGENCY: { fill: colors.dangerSoft, ink: colors.danger },
  IMPORTANT: { fill: colors.primarySoft, ink: colors.primaryDeep },
  NORMAL: { fill: colors.surfaceSunken, ink: colors.inkSoft },
  URGENT: { fill: colors.warningSoft, ink: colors.warningText },
});

/** One small chip on a notice card: a glyph and a label, the same height and type for the priority and the date. */
function NoticeChip({ children, fill, ink, label }: { children: ReactNode; fill: string; ink: string; label: string }) {
  const { fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: fill,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        height: 24,
        paddingLeft: 8,
        paddingRight: 10,
      }}
    >
      {children}
      <Text style={{ color: ink, fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 0.15 }}>{label}</Text>
    </View>
  );
}

/** One notice as its own card, its priority inside it (user, 2026-11-15). */
export function NoticeCard({ notice, onSelect }: { notice: NoticeSummary; onSelect: (notice: NoticeSummary) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityHint="Opens the full notice"
      accessibilityLabel={`${GROUP_LABEL[notice.priority]}: ${notice.title}`}
      accessibilityRole="button"
      onPress={() => onSelect(notice)}
    >
      {/* The arrow in a grey disc, centred on the whole card's height (user, 2026-11-15). */}
      <Card style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          {/* The priority, then the date, as one matched pair of chips (user, 2026-11-15). A general notice has no priority chip. */}
          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {notice.priority !== "NORMAL" ? (
              <NoticeChip fill={PRIORITY_TONE(colors)[notice.priority].fill} ink={PRIORITY_TONE(colors)[notice.priority].ink} label={priorityLabel(notice.priority)}>
                <PriorityMark priority={notice.priority} size={12} />
              </NoticeChip>
            ) : null}
            <NoticeChip fill={colors.surfaceSunken} ink={colors.inkSoft} label={noticeCardDate(notice.publishedAt)}>
              <Clock color={colors.muted} size={12} strokeWidth={2.4} />
            </NoticeChip>
          </View>
          <View style={{ gap: 3 }}>
            <Text
              ellipsizeMode="tail"
              numberOfLines={2}
              style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 16, letterSpacing: -0.2, lineHeight: 21 }}
            >
              {notice.title}
            </Text>
            <Text
              ellipsizeMode="tail"
              numberOfLines={2}
              style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17 }}
            >
              {notice.body}
            </Text>
          </View>
        </View>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surfaceSunken,
            borderRadius: 999,
            height: 26,
            justifyContent: "center",
            width: 26,
          }}
        >
          <ChevronRight color={colors.ink} size={15} strokeWidth={2.4} />
        </View>
      </Card>
    </AnimatedPressable>
  );
}

export { PriorityChip };
