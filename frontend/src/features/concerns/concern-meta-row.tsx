import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Clock3, DoorOpen, Folder, type LucideProps } from "lucide-react-native";

import { humanizeToken } from "@/features/owner/owner-ui";
import type { ConcernSummary } from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The facts line on a concern card, shared by the tenant and owner queues:
 * category, room and when it was raised, each in a grey pill with its own
 * glyph, then the image count (user, 2026-09-30).
 */
export function ConcernMetaRow({ concern }: { concern: Pick<ConcernSummary, "category" | "createdAt" | "photos" | "roomNumber"> }) {
  const { colors, fonts, type } = useTheme();
  const photoCount = concern.photos.filter((photo) => Boolean(photo.photoUrl)).length;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
      <MetaPill icon={Folder} label={humanizeToken(concern.category)} />
      <MetaPill icon={DoorOpen} label={`Room ${concern.roomNumber}`} />
      <MetaPill icon={Clock3} label={formatRaisedAt(concern.createdAt)} />
      {photoCount > 0 ? (
        <Text style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold, marginLeft: 2 }]}>
          +{photoCount} image{photoCount === 1 ? "" : "s"}
        </Text>
      ) : (
        <Text style={[type.caption, { color: colors.muted, fontFamily: fonts.sansMediumItalic, marginLeft: 2 }]}>
          No images
        </Text>
      )}
    </View>
  );
}

function MetaPill({ icon: Icon, label }: { icon: ComponentType<LucideProps>; label: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{
        alignItems: "center",
        backgroundColor: colors.neutralSoft,
        borderRadius: 999,
        flexDirection: "row",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Icon color={colors.neutralText} size={13} strokeWidth={2.2} />
      <Text numberOfLines={1} style={[type.caption, { color: colors.neutralText }]}>
        {label}
      </Text>
    </View>
  );
}

function formatRaisedAt(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
