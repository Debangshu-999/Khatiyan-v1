import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import { PaperAgreementPhotos } from "@/features/compliance/paper-agreement-photos";
import { useGetMyAgreementQuery } from "@/store/services/compliance-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_AGREEMENT_ILLUSTRATION = require("../assets/empty-states/No-Agreement_512x512.png");

// Read-only view of the tenant's own accepted agreement — every term they agreed
// to, in the same grouped layout the acceptance screen used.
export default function TenancyAgreementViewScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const agreementQuery = useGetMyAgreementQuery();
  const agreement = agreementQuery.data;
  // An existing tenant brought onto Khatiyan on their paper agreement has no
  // deed here: its photos are the agreement (P1.1, 2026-10-28).
  const tenancy = useGetMyActiveTenancyQuery().data?.tenancy ?? null;
  const paperPhotos = tenancy?.agreementOnPaper ? tenancy.paperAgreementPhotoUrls ?? [] : [];

  return (
    <ScreenScrollView>
      <ScreenHeader
        title="Your"
        italicTail="agreement."
        subtitle="The terms you accepted for this tenancy."
      />

      {agreementQuery.isFetching && !agreement ? (
        <>
          <SkeletonCard />
          <SkeletonList rows={3} />
        </>
      ) : !agreement && paperPhotos.length > 0 ? (
        <Card>
          <View style={{ gap: spacing.md }}>
            <Text style={[type.description, { color: colors.muted }]}>
              Your paper agreement carries over on Khatiyan. These are its pages, kept on file. Tap one to read it.
            </Text>
            <PaperAgreementPhotos urls={paperPhotos} />
          </View>
        </Card>
      ) : !agreement ? (
        <EmptyState
          artwork={NO_AGREEMENT_ILLUSTRATION}
          title="No agreement on file"
          description="This tenancy does not have an accepted agreement."
        />
      ) : (
        <>
          {agreement.acceptedAt ? (
            <Card tone="sunken">
              <Text style={[type.description, { color: colors.muted }]}>
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
