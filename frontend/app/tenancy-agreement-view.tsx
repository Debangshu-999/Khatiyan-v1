import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FileSignature } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { useGetMyAgreementQuery } from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Read-only view of the tenant's own accepted agreement — every term they agreed
// to, in the same grouped layout the acceptance screen used.
export default function TenancyAgreementViewScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const agreementQuery = useGetMyAgreementQuery();
  const agreement = agreementQuery.data;

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        title="Your"
        italicTail="agreement."
        subtitle="The terms you accepted for this tenancy."
      />

      {agreementQuery.isFetching && !agreement ? (
        <>
          <SkeletonCard />
          <SkeletonList />
        </>
      ) : !agreement ? (
        <EmptyState
          icon={FileSignature}
          title="No agreement on file"
          description="This tenancy does not have an accepted agreement."
        />
      ) : (
        <>
          {agreement.acceptedAt ? (
            <Card tone="sunken">
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                Accepted on{" "}
                <Text style={{ color: colors.ink, fontWeight: "800" }}>{formatDate(agreement.acceptedAt)}</Text>. This is
                the frozen copy of what you agreed to.
              </Text>
            </Card>
          ) : null}
          <View style={{ gap: spacing.md }}>
            <AgreementDocument
              acceptedAt={agreement.acceptedAt}
              clauses={agreement.clauses}
              preamble={agreement.preamble}
            />
          </View>
        </>
      )}
    </ScreenScrollView>
  );
}


function formatDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
