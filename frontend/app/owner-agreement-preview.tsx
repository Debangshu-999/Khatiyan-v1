import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { EmptyState } from "@/components/empty-state";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { useAppSelector } from "@/store/hooks";
import { useTheme } from "@/theme/use-theme";
import { spacing } from "@/theme/spacing";

export default function OwnerAgreementPreviewScreen() {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const document = useAppSelector((state) => state.agreementPreview.document);

  return (
    <ScreenScrollView refreshable={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft color={colors.ink} size={22} />
        </AnimatedPressable>
        <Text style={{ flex: 1, color: colors.ink, fontFamily: fonts.display, fontSize: 20, textAlign: "center" }}>
          Agreement <Text style={{ color: colors.accent }}>preview</Text>
        </Text>
        <View style={{ width: 36 }} />
      </View>
      {document ? (
        <AgreementDocument clauses={document.clauses} preamble={document.preamble} />
      ) : (
        <EmptyState title="No preview available" description="Return to onboarding and open the agreement preview again." />
      )}
    </ScreenScrollView>
  );
}
