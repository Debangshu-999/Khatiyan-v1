import { formatIndianPhone } from "@/features/owner/phone-display";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SavedBookmarkIcon } from "./saved-bookmark-icon";
import { AirVent } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { openDialer } from "@/lib/dial";
import { trackContactTap } from "@/features/analytics/use-profile-view";
import { useListSavedPropertyIdsQuery, useSetPropertySavedMutation, type PropertyDiscoveryDetail } from "@/store/services/discovery-api";
import { errorMessage } from "@/features/forms/server-error";
import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { ratingColor } from "@/features/food/meal-rating-tone";
import { formatDepositPaise, formatMoneyPaise, humanizeToken } from "../discovery-format";
import { PropertyMediaCarousel } from "./property-media-carousel";
import { RoomTypeShowcase } from "./room-type-showcase";
import { FitText } from "@/components/fit-text";

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * Each section of the profile has its own colour (user, 2026-11-14, "a little
 * more personality"): its dash, a line under its title and the icons in its
 * cards wear it.
 */
export const SECTION_TONES = {
  nextSteps: "#F97316",
  details: "#2F6CD9",
  facilities: "#16A34A",
  preferences: "#7C3AED",
  rooms: "#DB2777",
  contacts: "#0D9488",
};

/**
 * @param nextSteps the Next steps section (Enquire, Book a visit, Book a stay),
 *                  shown above Property details. The listing preview has none.
 */
export function PropertyProfile({
  nextSteps,
  property,
}: {
  nextSteps?: ReactNode;
  property: PropertyDiscoveryDetail;
}) {
  const { colors, fonts, type } = useTheme();
  const facilities = [...(property.facilities ?? []), ...(property.customFacilities ?? [])];
  const imageUrls = property.imageUrls?.length
    ? property.imageUrls
    : property.profileImageUrl
      ? [property.profileImageUrl]
      : [];
  const addressLine = [property.address, property.area, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const contacts = property.contacts ?? [];
  const ownerContact = contacts.find((contact) => contact.owner) ?? null;
  const managerContacts = contacts.filter((contact) => !contact.owner);
  const description =
    property.description ||
    property.headline ||
    `Comfortable ${humanizeToken(property.type)} stay in ${property.area || property.city} with essential amenities and easy city access.`;

  const propertyKind = humanizeToken(property.type);
  const pgForHighlight =
    property.pgFor === "MALE"
      ? { icon: "human-male-boy" as MaterialIconName, label: `${propertyKind} for Boys` }
      : property.pgFor === "FEMALE"
        ? { icon: "human-female-girl" as MaterialIconName, label: `${propertyKind} for Girls` }
        : { icon: "account-group-outline" as MaterialIconName, label: "Everyone Welcome" };

  function openDirections() {
    if (property.directionsUrl) {
      void Linking.openURL(property.directionsUrl);
      return;
    }
    const destination = encodeURIComponent(addressLine);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }

  return (
    <View style={{ gap: spacing.xl }}>

      <PropertyMediaCarousel
        captions={(property.images ?? []).map((image) => image.caption)}
        imageUrls={imageUrls}
        propertyName={property.name}
      />

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 29, letterSpacing: -0.7, lineHeight: 35 }}>
          {property.name}
        </Text>
        {/* Sizes swapped (user, 2026-10-02): the description reads at body
            size, the address at the smaller caption size under the name. */}
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
          <MaterialCommunityIcons color={colors.inkSoft} name="map-marker-outline" size={16} />
          <Text style={{ color: colors.muted, flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>
            {addressLine}
          </Text>
        </View>
        <Text style={[type.body, { color: colors.muted, lineHeight: 21, marginTop: spacing.xxs }]}>
          {description}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <QuickHighlight icon={pgForHighlight.icon} label={pgForHighlight.label} />
        <QuickHighlight
          crossed={!property.foodIncluded}
          icon="silverware-fork-knife"
          label={property.foodIncluded ? "Food Included" : "Food Not Included"}
          // The meal rating under it, when the owner shows it (user, 2026-11-07).
          rating={property.foodIncluded ? property.mealRating : null}
        />
        <QuickHighlight
          banned={!property.electricityIncluded}
          icon="lightbulb-outline"
          label={property.electricityIncluded ? "Electricity Included" : "Electricity Not Included"}
        />
        <QuickHighlight
          icon={property.dailyRentingAvailable ? "calendar-check-outline" : "calendar-month-outline"}
          label={property.dailyRentingAvailable ? "Daily Stay Available" : "Monthly Stay Only"}
        />
      </View>

      {nextSteps}

      <ProfileSection
        tagline="The basics, before you choose."
        title="Property details"
        tone={SECTION_TONES.details}
        trailing={
          <AnimatedPressable
            accessibilityLabel="View property on map"
            accessibilityRole="button"
            onPress={openDirections}
            style={{
              alignItems: "center",
              borderColor: colors.primary,
              borderCurve: "continuous",
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: "row",
              gap: 6,
              minHeight: 40,
              paddingHorizontal: spacing.sm + 2,
            }}
          >
            <MaterialCommunityIcons color={colors.primary} name="map-marker" size={17} />
            <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 12 }}>
              View on map
            </Text>
          </AnimatedPressable>
        }
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            justifyContent: "space-between",
          }}
        >
          <DetailCard tone={SECTION_TONES.details} icon="home-outline" label="Property type" value={humanizeToken(property.type)} />
          <DetailCard tone={SECTION_TONES.details} icon="currency-inr" label="Rent starts from" value={formatMoneyPaise(property.startingRoomRentPaise)} />
          <DetailCard tone={SECTION_TONES.details} icon="sack-outline" label="Deposit" value={formatDepositPaise(property.standardDepositPaise)} />
          <DetailCard
            tone={SECTION_TONES.details}
            icon="calendar-month-outline"
            label="Stay type"
            value={property.dailyRentingAvailable ? "Monthly + Daily" : "Monthly only"}
          />
          <DetailCard tone={SECTION_TONES.details} icon="clock-outline" label="Notice period" value={NOTICE_PERIOD_LABELS[property.noticePeriod]} />
          <DetailCard
            tone={SECTION_TONES.details}
            icon="timer-sand"
            label="Rent grace"
            value={property.rentGraceDays > 0 ? `${property.rentGraceDays} days` : "None"}
          />
          <DetailCard
            tone={SECTION_TONES.details}
            icon="fan"
            label="Daily Non-AC"
            value={property.dailyRentingAvailable ? formatMoneyPaise(property.dailyGuestNonAcRatePaise) : "Not available"}
          />
          <DetailCard
            tone={SECTION_TONES.details}
            icon="air-conditioner"
            label="Daily AC"
            value={property.dailyRentingAvailable ? formatMoneyPaise(property.dailyGuestAcRatePaise) : "Not available"}
          />
        </View>
      </ProfileSection>

      <ProfileSection tagline="What comes with the place." title="Facilities" tone={SECTION_TONES.facilities}>
        <FacilitiesGrid facilities={facilities} tone={SECTION_TONES.facilities} />
      </ProfileSection>

      <ProfileSection tagline="House rules, the friendly version." title="Stay preferences" tone={SECTION_TONES.preferences}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <PreferenceCard tone={SECTION_TONES.preferences} icon="account-group-outline" label="PG for" value={humanizeToken(property.pgFor)} />
          <PreferenceCard
            tone={SECTION_TONES.preferences}
            icon="account-outline"
            label="Preferred for"
            value={property.preferredFor === "PROFESSIONAL" ? "Working" : humanizeToken(property.preferredFor)}
          />
          <PreferenceCard tone={SECTION_TONES.preferences} icon="shower-head" label="Bathroom" value={humanizeToken(property.bathroomType)} />
          <PreferenceCard
            tone={SECTION_TONES.preferences}
            icon="lightbulb-outline"
            label="Electricity"
            value={property.electricityIncluded ? "Included" : "Not included"}
          />
          <PreferenceCard tone={SECTION_TONES.preferences} icon="silverware-fork-knife" label="Food" rating={property.mealRating} value={foodPreference(property)} />
          <PreferenceCard
            tone={SECTION_TONES.preferences}
            icon="human-greeting"
            label="Visitors"
            value={
              property.visitorsAllowed == null ? "Not specified" : property.visitorsAllowed ? "Allowed" : "Not allowed"
            }
          />
        </View>
      </ProfileSection>

      <ProfileSection tagline="Pick your corner." title="Room types" tone={SECTION_TONES.rooms}>
        <RoomTypeShowcase roomTypes={property.roomTypes ?? []} />
      </ProfileSection>

      <ProfileSection tagline="Real people, one call away." title="Contacts" tone={SECTION_TONES.contacts}>
        <View style={{ gap: spacing.sm }}>
          {ownerContact?.phone ? (
            <ContactCard
              tone={SECTION_TONES.contacts}
              name={ownerContact.name || "Property owner"}
              phone={ownerContact.phone}
              role="Owner"
            />
          ) : (
            <UnavailableContact message="Owner contact is not publicly visible for this listing." />
          )}
          {managerContacts.map((contact) => (
            <ContactCard
              tone={SECTION_TONES.contacts}
              key={contact.userId}
              name={contact.name || "Property manager"}
              phone={contact.phone ?? ""}
              role="Manager"
            />
          ))}
        </View>

      </ProfileSection>

    </View>
  );
}

/**
 * A section of the profile (user, 2026-11-14): bold lines in the section's
 * colour before the title (two for Next steps), a short tagline under it.
 */
export function ProfileSection({
  children,
  lines = 1,
  tagline,
  title,
  tone,
  trailing,
}: {
  children: ReactNode;
  lines?: 1 | 2;
  tagline?: string;
  title: string;
  tone: string;
  trailing?: ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <View style={{ alignItems: "flex-start", flex: 1, flexDirection: "row", gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 5 }}>
            <View style={{ backgroundColor: tone, borderCurve: "continuous", borderRadius: 3, height: 24, width: 6 }} />
            {lines === 2 ? <View style={{ backgroundColor: tone, borderCurve: "continuous", borderRadius: 3, height: 24, opacity: 0.45, width: 6 }} /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontFamily: fonts.display, fontSize: 23, letterSpacing: -0.45 }}>
              {title}
            </Text>
            {tagline ? (
              <Text style={{ color: colors.muted, fontFamily: fonts.fancyItalic, fontSize: 14, lineHeight: 19 }}>{tagline}</Text>
            ) : null}
          </View>
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );
}

/** The type and the Save and Share buttons, kept in the screen's fixed top bar (user, 2026-11-02). */
export function ProfileTopActions({ property }: { property: PropertyDiscoveryDetail }) {
  const { colors, fonts } = useTheme();
  const toast = useToast();
  // Saving (user, 2026-11-14): the bookmark fills blue when saved, and tapping it again removes it.
  const saved = (useListSavedPropertyIdsQuery().data ?? []).includes(property.propertyId);
  const [setSaved, setSavedState] = useSetPropertySavedMutation();
  const [refusal, setRefusal] = useState<string | null>(null);

  function showDummyAction(label: string) {
    toast.warning(`${label} is not available yet.`);
  }

  async function toggleSaved() {
    if (setSavedState.isLoading) return;
    const next = !saved;
    try {
      await setSaved({ propertyId: property.propertyId, saved: next }).unwrap();
      toast.success(next ? "Property saved" : "Removed from saved.");
    } catch (caught) {
      setRefusal(errorMessage(caught));
    }
  }

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 21,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            paddingHorizontal: spacing.md,
            ...softShadow(colors.shadow, 2, 8, 0.12),
          }}
        >
          <Text style={{ color: colors.inkSoft, fontFamily: fonts.sansBold, fontSize: 12 }}>
            {humanizeToken(property.type)}
          </Text>
        </View>
        <RoundIconButton
          active={saved}
          icon={saved ? "bookmark" : "bookmark-outline"}
          label={saved ? "Remove from saved" : "Save property"}
          onPress={() => void toggleSaved()}
        />
        <RoundIconButton
          icon="share-variant-outline"
          label="Share property"
          onPress={() => showDummyAction("Share")}
        />
        {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
      </View>
  );
}

/**
 * @param active saved (user, 2026-11-14): the button keeps its normal border, and the
 *               bookmark is filled blue with a black outline round its shape.
 */
function RoundIconButton({ active = false, icon, label, onPress }: { active?: boolean; icon: MaterialIconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 21,
        borderWidth: 1,
        height: 42,
        justifyContent: "center",
        ...softShadow(colors.shadow, 2, 8, 0.12),
        width: 42,
      }}
    >
      {active ? (
        <SavedBookmarkIcon size={21} />
      ) : (
        <MaterialCommunityIcons color={colors.inkSoft} name={icon} size={21} />
      )}
    </AnimatedPressable>
  );
}

/** The ring of the "not available" sign, sized to circle the 27pt glyph. */
const BAN_RING = 34;

/**
 * @param crossed a single strike through the glyph.
 * @param banned  the prohibition sign: the glyph inside a ring with a strike
 *                across it (user, 2026-10-02, for electricity not included).
 */
function QuickHighlight({ banned, crossed, icon, label, rating }: { banned?: boolean; crossed?: boolean; icon: MaterialIconName; label: string; rating?: number | null }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 78,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...cardShadow(colors.shadow),
        width: "48%",
      }}
    >
      <View style={{ alignItems: "center", height: banned ? BAN_RING : undefined, justifyContent: "center", width: banned ? BAN_RING : undefined }}>
        <MaterialCommunityIcons color={colors.inkSoft} name={icon} size={banned ? 20 : 27} />
        {banned ? (
          <>
            <View
              style={{
                borderColor: colors.inkSoft,
                borderRadius: BAN_RING / 2,
                borderWidth: 2,
                height: BAN_RING,
                position: "absolute",
                width: BAN_RING,
              }}
            />
            <View
              style={{
                backgroundColor: colors.inkSoft,
                height: 2,
                position: "absolute",
                transform: [{ rotate: "-45deg" }],
                width: BAN_RING - 2,
              }}
            />
          </>
        ) : null}
        {crossed ? (
          <View
            style={{
              backgroundColor: colors.inkSoft,
              height: 2,
              position: "absolute",
              transform: [{ rotate: "-45deg" }],
              width: 31,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>
          {label}
        </Text>
        {rating != null ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 3 }}>
            <MaterialCommunityIcons color={ratingColor(rating, colors)} name="star" size={12} />
            <Text style={{ color: ratingColor(rating, colors), fontFamily: fonts.sansBold, fontSize: 11.5 }}>{`${rating.toFixed(1)}/5`}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DetailCard({ icon, label, tone, value }: { icon: MaterialIconName; label: string; tone: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        minHeight: 92,
        padding: spacing.sm,
        width: "48%",
        ...cardShadow(colors.shadow),
      }}
    >
      <PropertyDetailIcon color={tone} icon={icon} size={25} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function PropertyDetailIcon({ color, icon, size }: { color: string; icon: MaterialIconName; size: number }) {
  if (icon === "air-conditioner") {
    return <AirVent color={color} size={size} strokeWidth={1.9} />;
  }
  if (icon === "sack-outline") {
    // A money bag with a rupee on it, for the deposit (user, 2026-11-02). The icon set has none.
    return (
      <View style={{ height: size, width: size }}>
        <MaterialCommunityIcons color={color} name={icon} size={size} />
        <Text
          allowFontScaling={false}
          style={{ color, fontSize: size * 0.42, fontWeight: "800", left: 0, lineHeight: size * 0.5, position: "absolute", right: 0, textAlign: "center", top: size * 0.42 }}
        >
          ₹
        </Text>
      </View>
    );
  }

  return <MaterialCommunityIcons color={color} name={icon} size={size} />;
}

function FacilitiesGrid({ facilities, tone }: { facilities: string[]; tone: string }) {
  const { colors, fonts, type } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const canExpand = facilities.length > 6;
  const visible = expanded ? facilities : facilities.slice(0, 6);

  if (facilities.length === 0) {
    return <UnavailableContact message="Facilities have not been listed yet." />;
  }

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.sm,
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {visible.map((facility, index) => (
          <View
            key={`${facility}-${index}`}
            style={{
              alignItems: "center",
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              gap: spacing.xs,
              justifyContent: "center",
              minHeight: 112,
              paddingHorizontal: spacing.xs,
              paddingVertical: spacing.sm,
              width: "31%",
            }}
          >
            <PropertyDetailIcon color={tone} icon={iconForFacility(facility)} size={28} />
            <FitText
              numberOfLines={2}
              style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 16, textAlign: "center" }}
            >
              {humanizeToken(facility)}
            </FitText>
            <Text style={[type.caption, { color: tone, fontFamily: fonts.sansBold, fontSize: 11 }]}>Available</Text>
          </View>
        ))}
      </View>
      {canExpand ? (
        <AnimatedPressable
          accessibilityLabel={expanded ? "Show fewer facilities" : `See all ${facilities.length} facilities`}
          accessibilityRole="button"
          onPress={() => setExpanded((current) => !current)}
          style={{
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            justifyContent: "space-between",
            minHeight: 50,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 14 }}>
            {expanded ? "See less" : `See all ${facilities.length} facilities`}
          </Text>
          <MaterialCommunityIcons color={colors.muted} name={expanded ? "chevron-up" : "chevron-right"} size={22} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

function PreferenceCard({ icon, label, rating, tone, value }: { icon: MaterialIconName; label: string; rating?: number | null; tone: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        minHeight: 136,
        padding: spacing.sm,
        width: "31%",
        ...cardShadow(colors.shadow),
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <MaterialCommunityIcons color={tone} name={icon} size={27} />
        {rating != null ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 3, marginLeft: spacing.xs }}>
            <MaterialCommunityIcons color={ratingColor(rating, colors)} name="star" size={12} />
            <Text style={{ color: ratingColor(rating, colors), fontFamily: fonts.sansBold, fontSize: 11.5 }}>{`${rating.toFixed(1)}/5`}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 13.5, lineHeight: 18 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// Profiles show no email, only a call (2026-10-18).
function ContactCard({
  name,
  phone,
  role,
  tone,
}: {
  name: string;
  phone: string;
  role: "Owner" | "Manager";
  tone: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 112,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <MaterialCommunityIcons color={tone} name="account-circle-outline" size={48} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={[type.caption, { color: tone, fontFamily: fonts.sansBold }]}>{role}</Text>
        <FitText numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.sansBold, fontSize: 17 }}>
          {name}
        </FitText>
        <FitText numberOfLines={1} style={[type.bodyStrong, { color: colors.muted }]}>
          {formatIndianPhone(phone)}
        </FitText>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <ContactAction icon="phone-outline" label={`Call ${name}`} onPress={() => { trackContactTap("CALL"); openDialer(phone); }} tone={tone} />
      </View>
    </View>
  );
}

function ContactAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: MaterialIconName;
  label: string;
  onPress: () => void;
  tone: string;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: tone,
        borderRadius: 22,
        borderWidth: 1.5,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <MaterialCommunityIcons color={tone} name={icon} size={21} />
    </AnimatedPressable>
  );
}

function UnavailableContact({ message }: { message: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      <Text style={[type.bodyStrong, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

function foodPreference(property: PropertyDiscoveryDetail) {
  if (!property.foodIncluded) {
    return "Not included";
  }
  if (property.includedMeals.length === 0) {
    return "Included";
  }
  const includedMeals = new Set(property.includedMeals);
  if (
    includedMeals.has("BREAKFAST") &&
    includedMeals.has("LUNCH") &&
    includedMeals.has("DINNER")
  ) {
    return "All meals";
  }
  return property.includedMeals.map((meal) => humanizeToken(meal)).join(", ");
}

function iconForFacility(facility: string): MaterialIconName {
  switch (facility) {
    case "WIFI":
      return "wifi";
    case "MESS":
    case "COMMON_KITCHEN":
      return "silverware-fork-knife";
    case "PARKING":
      return "parking";
    case "GYM":
      return "dumbbell";
    case "CCTV":
      return "cctv";
    case "SECURITY":
      return "shield-check-outline";
    case "DRINKING_WATER":
      return "cup-water";
    case "HOT_WATER":
      return "shower-head";
    case "REFRIGERATOR":
      return "fridge-outline";
    case "WASHING_MACHINE":
    case "LAUNDRY_SERVICE":
      return "washing-machine";
    case "HOUSEKEEPING":
      return "broom";
    case "ROOM_CLEANING":
      return "spray-bottle";
    case "POWER_BACKUP":
      return "power-plug-battery-outline";
    case "LIFT":
      return "elevator";
    case "AIR_CONDITIONING":
      return "air-conditioner";
    case "STUDY_AREA":
      return "book-open-page-variant-outline";
    default:
      return "check-circle-outline";
  }
}
