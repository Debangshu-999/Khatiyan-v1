import { useMemo, useState } from "react";
import { Image, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Lightbox } from "@/components/image-carousel";
import { SkeletonCard, SkeletonForm } from "@/components/skeleton";
import { IconButton } from "@/features/owner/owner-ui";
import {
  useListManualPaymentsQuery,
  type BillingCycle,
  type ManualPaymentMethod,
} from "@/store/services/billing-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** How the money arrived, in the words the picker offered when it was recorded. */
const METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  CARD: "Card",
  CASH: "Cash",
  CHEQUE: "Cheque",
  OTHER: "Other",
  UPI: "UPI",
};

/**
 * What the reference number IS, per method.
 *
 * <p>"Reference" alone is useless to an owner checking a bank statement — a
 * cheque number and a UTR are looked up in completely different places, and the
 * recording form already named each one when it asked for it. This says the
 * same words back.
 */
const REFERENCE_LABELS: Record<ManualPaymentMethod, string> = {
  CARD: "Approval code",
  CASH: "Reference",
  CHEQUE: "Cheque number",
  OTHER: "Reference",
  UPI: "UTR reference",
};

/**
 * The record of how a bill was settled, opened from the bill's own menu.
 *
 * <p>
 * Every paid bill has one: an owner marking it paid writes it directly, and an
 * owner verifying a tenant's payment claim goes through the same path on the
 * server, which stamps UPI as the method and carries the tenant's reference and
 * screenshots across. So this sheet is the one place either kind of payment can
 * be read back, months later, against a bank statement.
 *
 * <p>
 * Paid bills only. There is nothing to show before a payment exists, and the
 * menu does not offer it.
 */
export function PaymentDetailsSheet({
  cycle,
  onClose,
  propertyName,
}: {
  cycle: BillingCycle;
  onClose: () => void;
  propertyName: string | null;
}) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [viewingProofAt, setViewingProofAt] = useState<number | null>(null);
  const query = useListManualPaymentsQuery(cycle.id);

  /**
   * The payment that settled the bill.
   *
   * <p>The endpoint returns a list because the table is a log, not a column on
   * the cycle. In practice a cycle has exactly one — recording a payment is
   * refused once a bill is paid — so the most recent row IS the payment, and
   * sorting rather than taking the first keeps that true if the server ever
   * changes its order.
   */
  const payment = useMemo(() => {
    const rows = query.data ?? [];
    if (!rows.length) {
      return null;
    }
    return [...rows].sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))[0];
  }, [query.data]);

  // The cycle's own stamp is the fallback. Bills paid before this log existed
  // have no row, and a sheet that comes up blank on one of them looks broken
  // rather than old.
  const paidOn = payment?.collectedAt ?? cycle.paidAt;
  const proofImageUrls = payment?.proofImageUrls ?? [];
  const referenceText = payment?.referenceText ?? null;
  const hasProof = Boolean(referenceText) || proofImageUrls.length > 0;

  return (
    <>
    <Modal animationType="slide" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          {/* The receipt sheet's header, to the letter. The two are read one
              after the other — the receipt says what was owed, this says what
              came in — and a different heading on each made them look like
              screens from different parts of the app. */}
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Payment{propertyName ? ` · ${propertyName}` : ""}
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22 }}>
                {cycle.referenceCode}
              </Text>
            </View>
            <IconButton accessibilityLabel="Close payment details" icon={X} onPress={onClose} />
          </View>

          <ScrollView
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
          >
            {query.isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonForm fields={0} media note={false} />
              </>
            ) : (
              <>
                <Card style={{ gap: spacing.sm }} tone="raised">
                  <DetailRow label="Tenant" value={cycle.tenantNameSnapshot} />
                  <DetailRow label="Tenancy ID" mono value={cycle.tenancyReferenceCode ?? "Not recorded"} />
                  <DetailRow label="Paid on" value={paidOn ? formatPaidOn(paidOn) : "Not recorded"} />
                  <DetailRow label="Payment mode" value={payment ? METHOD_LABELS[payment.method] : "Not recorded"} />
                </Card>

                {/* Its own card, because it is evidence rather than a fifth
                    field: the reference and the screenshots are two forms of
                    the same claim, and either one alone is enough. */}
                <Card style={{ gap: spacing.sm }} tone="raised">
                  <Text style={[type.label, { color: colors.inkSoft }]}>Payment proof</Text>

                  {hasProof ? (
                    <>
                      {referenceText ? (
                        <View style={{ gap: 2 }}>
                          <Text style={[type.caption, { color: colors.muted }]}>
                            {REFERENCE_LABELS[payment?.method ?? "OTHER"]}
                          </Text>
                          <Text style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 14 }}>
                            {referenceText}
                          </Text>
                        </View>
                      ) : null}

                      {proofImageUrls.length > 0 ? (
                        <ProofPreview onOpen={() => setViewingProofAt(0)} urls={proofImageUrls} />
                      ) : null}
                    </>
                  ) : (
                    // Not a gap in the record. Cash leaves no reference to quote
                    // and no slip to photograph, which is why the recording form
                    // does not ask for either.
                    <Text style={[type.caption, { color: colors.muted, fontStyle: "italic", lineHeight: 18 }]}>
                      {payment?.method === "CASH"
                        ? "Cash was handed over in person, so there is nothing to attach."
                        : "No reference or photo was recorded with this payment."}
                    </Text>
                  )}
                </Card>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* A SIBLING of the sheet, not a child of it. Nested Modals are unreliable
        on Android, which is why the billing sheet's own confirmation dialog
        sits outside its Modal too — mounted after, so it lands on top. */}
    {viewingProofAt !== null ? (
      <Lightbox images={proofImageUrls} initialIndex={viewingProofAt} onClose={() => setViewingProofAt(null)} />
    ) : null}
    </>
  );
}

/** Label left, value right — the receipt document's row, at the same weights. */
function DetailRow({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      <Text
        style={{
          color: colors.ink,
          flex: 1,
          fontFamily: mono ? fonts.mono : fonts.sansMedium,
          fontSize: 13,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * One image, whatever the count, with the rest behind it.
 *
 * <p>
 * Large rather than a thumbnail: this section exists to be looked AT, and a
 * bank app's confirmation screen is unreadable at 46px. The count says how many
 * MORE there are, since the one on screen is already accounted for by being
 * visible, and the viewer behind it pages through the whole set.
 */
function ProofPreview({ onOpen, urls }: { onOpen: () => void; urls: string[] }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={urls.length > 1 ? `Open ${urls.length} payment proof photos` : "Open payment proof photo"}
      accessibilityRole="imagebutton"
      onPress={onOpen}
      style={{
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        height: 180,
        // So the count pill and the photo both stop at the rounded corner.
        overflow: "hidden",
      }}
    >
      <Image resizeMode="cover" source={{ uri: urls[0] }} style={{ height: "100%", width: "100%" }} />

      {urls.length > 1 ? (
        <View
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.62)",
            borderRadius: 999,
            bottom: spacing.sm,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            position: "absolute",
            right: spacing.sm,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 12 }}>
            +{urls.length - 1}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * The moment the money was taken, in IST.
 *
 * <p>Pinned to Asia/Kolkata like every other stamp in the app, and like the
 * receipt PDF: this is the figure an owner reconciles against a bank statement,
 * and a device left on another zone would quietly shift it by a day.
 */
function formatPaidOn(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date(value));
}
