import { Linking, Text, View } from "react-native";

import { Card } from "@/components/card";
import type { PropertyLocalPlace } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { formatDistance, humanizeToken } from "../discovery-format";
import { DiscoveryButton } from "./discovery-button";

type LocalPlaceCardProps = {
  place: PropertyLocalPlace;
};

export function LocalPlaceCard({ place }: LocalPlaceCardProps) {
  const { colors } = useTheme();

  function openDirections() {
    if (place.directionsUrl) {
      void Linking.openURL(place.directionsUrl);
      return;
    }

    const query = encodeURIComponent(`${place.name}, ${place.addressText}`);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, flex: 1, fontSize: 19, fontWeight: "900" }} selectable>
            {place.name}
          </Text>
          {place.ownerRecommended ? <InlineTag label="Owner recommended" tone="success" /> : null}
        </View>
        <Text style={{ color: colors.primary, fontWeight: "800" }} selectable>
          {formatDistance(place.distanceKm)}
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }} selectable>
          {place.description || place.addressText}
        </Text>
      </View>

      {(place.tags?.length ?? 0) > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {(place.tags ?? []).map((tag) => (
            <InlineTag key={tag} label={humanizeToken(tag)} />
          ))}
        </View>
      ) : null}

      {place.phone ? (
        <Text style={{ color: colors.muted, fontWeight: "700" }} selectable>
          {place.phone}
        </Text>
      ) : null}

      <DiscoveryButton label="Open directions" muted onPress={openDirections} />
    </Card>
  );
}

function InlineTag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" }) {
  const { colors } = useTheme();
  const borderColor = tone === "success" ? colors.jade : colors.border;
  const textColor = tone === "success" ? colors.jade : colors.inkSoft;

  return (
    <View
      style={{
        borderColor,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </View>
  );
}
