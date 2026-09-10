import { Text, View } from "react-native";
import { BellRing, CalendarDays, Hash, MapPin, User, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";

import { Skeleton } from "@/components/skeletons/primitives";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Identity controls while their values load. Labels remain readable because
 * they are static; only the API-provided field contents shimmer.
 */
export function AccountIdentityFieldsSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <IdentityField icon={MapPin} label="Permanent address" multiline />
      <IdentityField icon={Hash} label="PIN code" />
      <IdentityField icon={CalendarDays} label="Date of birth" />
      <IdentityField icon={User} label="Gender" />
    </View>
  );
}

function IdentityField({
  icon: Icon,
  label,
  multiline = false,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  multiline?: boolean;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Icon color={colors.muted} size={15} strokeWidth={2.2} />
        <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      </View>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 10,
          borderWidth: 1,
          justifyContent: "center",
          minHeight: multiline ? 82 : 46,
          paddingHorizontal: spacing.md,
        }}
      >
        <Skeleton height={13} width={multiline ? "72%" : "45%"} />
      </View>
    </View>
  );
}

/** The device-alert preference while the registered-device API resolves. */
export function AccountDeviceAlertSkeleton() {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <BellRing color={colors.ink} size={20} strokeWidth={2.2} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
            Push notifications
          </Text>
          <Skeleton height={10} width="72%" />
        </View>
        <Skeleton height={28} radius={999} width={48} />
      </View>
      <Skeleton height={10} width="56%" />
    </View>
  );
}
