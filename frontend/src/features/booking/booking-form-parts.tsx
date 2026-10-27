import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import { Check, ImageOff, MapPin, PenLine, UserRound, type LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PropertyArtwork } from "@/components/artwork-icon";
import { Card } from "@/components/card";
import { ImageCarousel } from "@/components/image-carousel";
import type { BookingRoomStatus } from "@/features/booking/booking-request-form";
import { bookingDateLabel } from "@/features/booking/booking-ui";
import { formatMoneyPaise, humanizeToken } from "@/features/owner/owner-ui";
import { ROOM_AMENITY_ICONS } from "@/features/property/room-amenity-icons";
import { ROOM_AMENITY_LABELS } from "@/features/property/room-amenity-strip";
import type { Gender } from "@/store/services/auth-api";
import type { BookingFormRoom } from "@/store/services/booking-api";
import type { RoomAmenity } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";

/**
 * The pieces of the tenant's booking form, drawn from the user's own demo
 * screens (2026-10-10). The screen in `app/booking-request.tsx` decides what
 * is shown and when. These only draw it.
 */

export const BOOKING_STEPS = ["Details", "Room", "Terms", "Review"] as const;

/**
 * Where the person is in the form: numbered circles joined by a line. A step
 * already done shows a tick and takes a tap, which is the way back on a
 * screen with no back row.
 */
export function BookingStepper({ disabled, onJump, step }: { disabled?: boolean; onJump: (step: number) => void; step: number }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row" }}>
      {BOOKING_STEPS.map((label, index) => {
        const done = index < step;
        const active = index === step;
        const reached = done || active;
        return (
          <View key={label} style={{ alignItems: "center", flex: 1, gap: 6 }}>
            <View style={{ alignItems: "center", alignSelf: "stretch", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: index === 0 ? "transparent" : reached ? colors.primary : colors.border, flex: 1, height: 2 }} />
              <AnimatedPressable
                accessibilityLabel={`Step ${index + 1} of ${BOOKING_STEPS.length}, ${label}${done ? ". Go back to it" : active ? ", current" : ""}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !done || disabled, selected: active }}
                disabled={!done || disabled}
                hitSlop={8}
                onPress={() => onJump(index)}
                style={{
                  alignItems: "center",
                  backgroundColor: reached ? colors.primary : colors.surface,
                  borderColor: reached ? colors.primary : colors.borderStrong,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  height: 34,
                  justifyContent: "center",
                  width: 34,
                }}
              >
                {done ? (
                  <Check color={colors.onPrimary} size={17} strokeWidth={3} />
                ) : (
                  <Text style={{ color: active ? colors.onPrimary : colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>{index + 1}</Text>
                )}
              </AnimatedPressable>
              <View style={{ backgroundColor: index === BOOKING_STEPS.length - 1 ? "transparent" : done ? colors.primary : colors.border, flex: 1, height: 2 }} />
            </View>
            <Text style={[type.caption, { color: active ? colors.primary : colors.muted, fontFamily: active ? fonts.sansBold : fonts.sansMedium, fontSize: 12.5 }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** The property being booked, where it is, and the visit that opened the booking window. */
export function BookingPropertyCard({ area, city, name, visitedOn }: { area: string | null; city: string | null; name: string | null; visitedOn: string | null }) {
  const { colors, fonts, type } = useTheme();
  const place = [area, city].filter(Boolean).join(", ");
  return (
    <Card style={{ alignItems: "center", flexDirection: "row" }}>
      {/* The app's own property mark, the one on the Home property card (user, 2026-10-10). */}
      <PropertyArtwork size={40} />
      {/* The pill sits at the far end where there is room, as on the demo. On a
          narrow phone it drops under the name, and the name is never squeezed
          onto two lines to make way for it. */}
      <View style={{ alignItems: "center", columnGap: spacing.sm, flex: 1, flexDirection: "row", flexWrap: "wrap", rowGap: 6 }}>
        <View style={{ flexBasis: 170, flexGrow: 1, gap: 2 }}>
          <FitText numberOfLines={2} style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 17 }}>{name ?? "The property you visited"}</FitText>
          {place ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <MapPin color={colors.muted} size={14} />
              <FitText numberOfLines={1} style={[type.description, { color: colors.muted, flex: 1 }]}>{place}</FitText>
            </View>
          ) : null}
        </View>
        {visitedOn ? (
          <View style={{ alignItems: "center", backgroundColor: colors.successSoft, borderCurve: "continuous", borderRadius: radii.sm, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7 }}>
            <TickDisc />
            <Text style={{ color: colors.successText, fontFamily: fonts.displaySoft, fontSize: 13 }}>Visited {bookingDateLabel(visitedOn)}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** A green disc with a white tick: something checked and found good. */
function TickDisc({ size = 16 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.successText, borderRadius: 999, height: size, justifyContent: "center", width: size }}>
      <Check color={colors.onPrimary} size={Math.round(size * 0.66)} strokeWidth={3.4} />
    </View>
  );
}

/**
 * Under the date of birth, where it makes the person 18 or older.
 *
 * <p>"Verified adult", green with its tick, only where the date of birth came
 * from an ID check (user, 2026-10-10). A date the person typed themselves is
 * not a check, so it gets a plain line and no tick.
 */
export function VerifiedAdult({ verified }: { verified: boolean }) {
  const { colors, fonts, type } = useTheme();
  if (!verified) return <Text style={[type.description, { color: colors.muted }]}>18 or older</Text>;
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <TickDisc />
      <Text style={{ color: colors.successText, fontFamily: fonts.displaySoft, fontSize: 13 }}>Verified adult</Text>
    </View>
  );
}

/**
 * The person's gender as the demo draws it: Male, Female and Other side by
 * side, theirs chosen. Shown and not asked for, so no chip takes a tap (user,
 * 2026-10-10: "the way it shows but selected and uneditable"). A third answer
 * is named as the profile names it. With none on the profile nothing is
 * chosen, and the reason is underneath.
 */
export function BookingGenderChips({ error, value }: { error?: string; value: Gender | null }) {
  const { colors, type } = useTheme();
  const chosen = value === "MALE" ? 0 : value === "FEMALE" ? 1 : value === "OTHER" || value === "TRANSGENDER" ? 2 : -1;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>Gender</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {["Male", "Female", value === "TRANSGENDER" ? "Transgender" : "Other"].map((label, index) => (
          <ChoiceChip key={label} fill icon={UserRound} label={label} readOnly selected={index === chosen} />
        ))}
      </View>
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * A detail carried from the person's profile: shown, never typed here (user,
 * 2026-10-10). Sunken, like every other read-only field in the app. What is
 * wrong with it is said underneath, with where to fix it.
 */
export function ReadOnlyField({ error, icon: Icon, label, placeholder = "Not added", value }: { error?: string; icon?: ComponentType<LucideProps>; label: string; placeholder?: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>{label}</Text>
      <View
        accessibilityLabel={`${label}: ${value || placeholder}`}
        accessible
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderColor: error ? colors.danger : colors.border,
          borderCurve: "continuous",
          borderRadius: 10,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 46,
          paddingHorizontal: spacing.md,
        }}
      >
        {Icon ? <Icon color={colors.muted} size={18} /> : null}
        <Text selectable style={{ color: value ? colors.ink : colors.muted, flex: 1, fontFamily: value ? fonts.sansMedium : fonts.sans, fontSize: 14 }}>{value || placeholder}</Text>
      </View>
      {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** A radio button: a ring, with a dot inside when chosen. */
export function RadioMark({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const ring = disabled ? colors.border : checked ? colors.primary : colors.borderStrong;
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: ring, borderRadius: 999, borderWidth: 2, height: 22, justifyContent: "center", width: 22 }}>
      {checked ? <View style={{ backgroundColor: colors.primary, borderRadius: 999, height: 10, width: 10 }} /> : null}
    </View>
  );
}

/** One choice of a few on a line of its own: its radio and its name. */
export function RadioOption({ disabled, label, onPress, selected }: { disabled?: boolean; label: string; onPress: () => void; selected: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} hitSlop={6} onPress={onPress} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 32 }}>
      <RadioMark checked={selected} />
      <Text style={{ color: colors.ink, fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 15 }}>{label}</Text>
    </AnimatedPressable>
  );
}

/** A card's heading with its mark, as on the Stay terms screen. */
export function CardHeading({ icon: Icon, title, trailing }: { icon?: ComponentType<LucideProps>; title: string; trailing?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      {Icon ? <Icon color={colors.primary} size={22} strokeWidth={2} /> : null}
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.displaySoft, fontSize: 18 }}>{title}</Text>
      {trailing}
    </View>
  );
}

export function Hairline() {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.border, height: 1 }} />;
}

/** "AC · 2 sharing". Sharing is the room's own bed count, never read off its type. */
export function roomKindLabel(room: Pick<BookingFormRoom, "capacity" | "conditioning">) {
  return `${room.conditioning === "AC" ? "AC" : "Non-AC"} · ${room.capacity} sharing`;
}

export function RoomRent({ paise, size = 17 }: { paise: number; size?: number }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: size - 3 }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: size }}>{formatMoneyPaise(paise)}</Text> /month
    </Text>
  );
}

/** What a room comes with, each with its glyph. The same on every card that names a room. */
export function RoomAmenityRow({ faded, room }: { faded?: boolean; room: Pick<BookingFormRoom, "amenities" | "customAmenities"> }) {
  const { colors, type } = useTheme();
  const tint = faded ? colors.border : colors.inkSoft;
  if (room.amenities.length + room.customAmenities.length === 0) return null;
  return (
    <View style={{ alignItems: "center", columnGap: spacing.md, flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
      {room.amenities.map((name) => {
        const Icon = ROOM_AMENITY_ICONS[name as RoomAmenity];
        return (
          <View key={name} style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            {Icon ? <Icon color={tint} size={17} /> : null}
            <Text style={[type.description, { color: colors.muted }]}>{ROOM_AMENITY_LABELS[name as RoomAmenity] ?? humanizeToken(name)}</Text>
          </View>
        );
      })}
      {room.customAmenities.map((name) => <Text key={name} style={[type.description, { color: colors.muted }]}>{name}</Text>)}
    </View>
  );
}

/**
 * What can be asked for, as a chip: a bed free now, the first day one is
 * free, or nothing. Bold, in the face the app sets a control's small label in
 * (user, 2026-10-10: "the chips font should be bolder"). No dot inside.
 */
export function VacancyChip({ label, tone }: { label: string; tone: "neutral" | "primary" | "success" | "warning" }) {
  const { colors, fonts } = useTheme();
  const palette = {
    neutral: { fill: colors.neutralSoft, ink: colors.neutralText },
    primary: { fill: colors.primarySoft, ink: colors.primaryDeep },
    success: { fill: colors.successSoft, ink: colors.successText },
    warning: { fill: colors.warningSoft, ink: colors.warningText },
  }[tone];
  return (
    <View style={{ backgroundColor: palette.fill, borderRadius: 999, flexShrink: 1, paddingHorizontal: 10, paddingVertical: 6 }}>
      <FitText numberOfLines={1} style={{ color: palette.ink, fontFamily: fonts.displaySoft, fontSize: 12.5 }}>{label}</FitText>
    </View>
  );
}

/**
 * One room to choose from, the same on both tabs (user, 2026-10-10).
 *
 * <p>No radio ring. The chosen card is filled pale blue and keeps its plain
 * border, the way a chosen picker row is. The vacancy chip sits top right on
 * the number's line with its note under it on the kind's line, then the rent,
 * a rule, and the amenities with their glyphs. A room with no bed to ask for
 * is faint and takes no tap, and says why.
 */
export function RoomChoiceCard({ disabled, onPress, room, selected, status }: { disabled?: boolean; onPress: () => void; room: BookingFormRoom; selected: boolean; status: BookingRoomStatus }) {
  const { colors, fonts, type } = useTheme();
  const off = !status.selectable;
  return (
    <AnimatedPressable
      accessibilityLabel={`Room ${room.roomNumber}, ${roomKindLabel(room)}, ${status.label}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: off || disabled }}
      disabled={off || disabled}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        opacity: off ? 0.55 : 1,
        padding: spacing.lg,
      }}
    >
      <View style={{ gap: 2 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.displaySoft, fontSize: 18 }}>{room.roomNumber}</Text>
          <VacancyChip label={status.label} tone={status.tone} />
        </View>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={[type.description, { color: colors.muted }]}>{roomKindLabel(room)}</Text>
          {status.note ? <Text style={[type.description, { color: colors.muted, flexShrink: 1, paddingTop: 2, textAlign: "right" }]}>{status.note}</Text> : null}
        </View>
        <RoomRent paise={room.listedRentPaise} />
      </View>
      <Hairline />
      <RoomAmenityRow faded={off} room={room} />
    </AnimatedPressable>
  );
}

/**
 * What a room of this type looks like, opened under a room once it is chosen
 * (user, 2026-10-10). The photos are the room TYPE's: an owner photographs a
 * type once and every room cut from it shares them, which the caption says.
 * A type with no photo says so, so the card is never an empty box.
 */
export function RoomPhotosCard({ room }: { room: Pick<BookingFormRoom, "capacity" | "conditioning" | "imageUrls" | "roomNumber"> }) {
  const { colors, fonts, type } = useTheme();
  const photos = room.imageUrls ?? [];
  return (
    <Card style={{ gap: spacing.sm, padding: spacing.md }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.displaySoft, fontSize: 15 }}>Photos for this room</Text>
      {/* Tall where there are photos to look at, the carousel's own height in
          the rest of the app. Short only when empty (user, 2026-10-10). */}
      <RoomPhotosWindow height={260} images={photos} />
      {photos.length > 0 ? <Text style={[type.description, { color: colors.muted }]}>These show the room type, {roomKindLabel(room)}. Room {room.roomNumber} may differ a little.</Text> : null}
    </Card>
  );
}

/** How tall the photo window is when there is no photo to show in it. */
const NO_PHOTOS_HEIGHT = 84;

/**
 * The window a room type's photos are seen through: the app's carousel where
 * there are photos, and the same window with a no-photos mark where there are
 * none (user, 2026-10-10). The shape stays, so a type nobody has photographed
 * reads as "no photos" and not as a card that failed to load.
 */
export function RoomPhotosWindow({ emptyHeight, height = 200, images }: { emptyHeight?: number; height?: number; images: string[] }) {
  const { colors, fonts } = useTheme();
  if (images.length > 0) return <ImageCarousel height={height} images={images} radius={radii.card} />;
  // With nothing to show the window is short, unless the caller says how tall.
  // At the carousel's full height it was a tall grey block under the room
  // (user, 2026-10-10: "make the height of the grey area smaller"). Beside the
  // room on Your room it is given the room's own height, so it never is short.
  emptyHeight ??= Math.min(height, NO_PHOTOS_HEIGHT);
  return (
    <View
      accessibilityLabel="No photos have been added for this room type"
      accessible
      style={{ alignItems: "center", backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, gap: spacing.xxs, height: emptyHeight, justifyContent: "center", paddingHorizontal: spacing.sm }}
    >
      <ImageOff color={colors.muted} size={22} strokeWidth={1.8} />
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 13, textAlign: "center" }}>No photos yet</Text>
    </View>
  );
}

/** One bed to ask for in the chosen room: free now, or free once someone has left. */
export function BedChoiceRow({ count, disabled, note, onPress, selected, title }: { count: string; disabled?: boolean; note?: string | null; onPress: () => void; selected: boolean; title: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        // The radio and the chip say which is chosen. No blue border (user, 2026-10-10).
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        opacity: disabled && !selected ? 0.6 : 1,
        padding: spacing.md,
      }}
    >
      <RadioMark checked={selected} disabled={disabled && !selected} />
      {/* The count shares the title's line and the note runs full width under
          both. Beside a two-line column the count squeezed "Future vacancy"
          onto two lines on a phone. */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <FitText numberOfLines={1} style={{ color: colors.ink, flexShrink: 0, fontFamily: fonts.sansBold, fontSize: 15 }}>{title}</FitText>
          <VacancyChip label={count} tone={selected ? "primary" : "neutral"} />
        </View>
        {note ? <Text style={[type.description, { color: colors.muted }]}>{note}</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

/**
 * A chip: AC, Non-AC, "2 sharing", and the gender row on the first step. Bold,
 * with its icon where it has one (user, 2026-10-10). Chosen is outlined in
 * blue on the tint a chosen picker row has.
 *
 * <p>`readOnly` shows a choice that is not this screen's to make: nothing
 * takes a tap, and the ones not chosen are quiet. `fill` shares a row's width.
 */
export function ChoiceChip({ disabled, fill, icon: Icon, label, onPress, readOnly, selected }: { disabled?: boolean; fill?: boolean; icon?: ComponentType<LucideProps>; label: string; onPress?: () => void; readOnly?: boolean; selected: boolean }) {
  const { colors, fonts } = useTheme();
  const ink = selected ? colors.primaryDeep : readOnly ? colors.muted : colors.inkSoft;
  const style = {
    alignItems: "center",
    backgroundColor: selected ? colors.primarySoft : colors.surface,
    borderColor: selected ? colors.primary : colors.borderStrong,
    borderCurve: "continuous",
    borderRadius: radii.card,
    borderWidth: selected ? 1.5 : 1,
    flexDirection: "row",
    flexGrow: fill ? 1 : 0,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: fill ? spacing.sm : spacing.md,
  } as const;
  const content = (
    <>
      {Icon ? <Icon color={selected ? colors.primary : colors.muted} size={18} strokeWidth={2.3} /> : null}
      <FitText numberOfLines={1} style={{ color: ink, flexShrink: 1, fontFamily: fonts.displaySoft, fontSize: 14.5 }}>{label}</FitText>
    </>
  );
  if (readOnly) return <View accessibilityLabel={label} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: true }} accessible style={style}>{content}</View>;
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={() => onPress?.()} style={style}>
      {content}
    </AnimatedPressable>
  );
}

/** One line of the terms being sent: what it is on the left, its value on the right. */
export function TermRow({ first, label, strong, value }: { first?: boolean; label: string; strong?: boolean; value: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", borderTopColor: colors.border, borderTopWidth: first ? 0 : 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingBottom: spacing.sm, paddingTop: first ? 0 : spacing.sm }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: strong ? colors.primary : colors.ink, flexShrink: 1, fontFamily: strong ? fonts.sansBold : fonts.sansMedium, fontSize: 14, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

/** A pen over its line and a word, on the review screen: back to the step that holds it. The mark is the demo's (user, 2026-10-11). */
export function EditLink({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={`Change ${label.toLowerCase()}`} accessibilityRole="button" disabled={disabled} hitSlop={10} onPress={onPress} style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
      <PenLine color={colors.primary} size={16} strokeWidth={2.1} />
      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13.5 }}>{label}</Text>
    </AnimatedPressable>
  );
}
