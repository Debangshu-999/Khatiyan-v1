import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { GhostBlock, SkeletonBoundary } from "@/components/skeletons/boundary";
import { formatSlotRange, formatVisitDay } from "@/features/enquiry/visit-time";
import { errorMessage } from "@/features/forms/server-error";
import { formatPassCode } from "@/features/visits/visit-clock";
import { useGetVisitPassQuery } from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const QR_SIZE = 190;
/** The QR's white card, edge to edge: the grey box above it is made as wide. */
const QR_CARD_WIDTH = QR_SIZE + spacing.md * 2 + 2;

/**
 * The visitor's pass (user, 2026-10-04): the property's name, centred, then
 * the date and the slot on two lines in a grey box, then a QR to show at the
 * property with a six digit code under it for when it cannot be scanned. It
 * opens an hour before the slot, and the server says so when it is asked for
 * earlier.
 *
 * <p>The sheet has no heading and no close button of its own. The close sits
 * above it, outside, a round button like the wallet PIN sheet's (user,
 * 2026-10-04), so the property's name starts close to the sheet's top edge.
 * That is why this is a custom sheet and not `SheetShell`, whose head carries
 * the title and the close.
 *
 * <p>The QR sits on white whatever the theme: a scanner reads dark on light.
 */
export function VisitorPassSheet({ onClose, visitId }: { onClose: () => void; visitId: string }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const pass = useGetVisitPassQuery(visitId, { refetchOnMountOrArgChange: true });

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + spacing.md }}>
          <AnimatedPressable
            accessibilityLabel="Close visitor pass"
            accessibilityRole="button"
            onPress={() => dismiss()}
            style={{
              alignItems: "center",
              alignSelf: "center",
              backgroundColor: colors.surface,
              borderRadius: 23,
              height: 46,
              justifyContent: "center",
              marginBottom: spacing.md,
              width: 46,
            }}
          >
            <X color={colors.ink} size={23} />
          </AnimatedPressable>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              // Bounded by what is left under the close button, so a short
              // phone scrolls the pass instead of pushing the button off.
              flexShrink: 1,
            }}
          >
            <ScrollView
              bounces={false}
              contentContainerStyle={{
                paddingBottom: insets.bottom + spacing.md,
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.lg,
              }}
              overScrollMode="never"
              showsVerticalScrollIndicator={false}
            >
              {pass.isLoading ? (
                <SkeletonBoundary>
                  <View style={{ alignItems: "center", gap: spacing.md }}>
                    <View style={{ width: QR_SIZE }}>
                      <GhostBlock height={QR_SIZE}>
                        <View style={{ height: QR_SIZE }} />
                      </GhostBlock>
                    </View>
                  </View>
                </SkeletonBoundary>
              ) : pass.data ? (
                <View style={{ alignItems: "center", gap: spacing.md }}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: fonts.display,
                      fontSize: 22,
                      lineHeight: 28,
                      textAlign: "center",
                    }}
                  >
                    {pass.data.propertyName}
                  </Text>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.neutralSoft,
                      borderCurve: "continuous",
                      borderRadius: radii.card,
                      gap: 2,
                      minWidth: QR_CARD_WIDTH,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                      {formatVisitDay(pass.data.date)}
                    </Text>
                    <Text style={{ color: colors.neutralText, fontFamily: fonts.sansMedium, fontSize: 14 }}>
                      {formatSlotRange(pass.data.slotStart, pass.data.slotEnd)}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderColor: colors.border,
                      borderCurve: "continuous",
                      borderRadius: radii.card,
                      borderWidth: 1,
                      padding: spacing.md,
                    }}
                  >
                    <QRCode backgroundColor="#FFFFFF" color="#000000" size={QR_SIZE} value={pass.data.token} />
                  </View>
                  <Text
                    accessibilityLabel={`Pass code ${pass.data.code.split("").join(" ")}`}
                    style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 28, letterSpacing: 4 }}
                  >
                    {formatPassCode(pass.data.code)}
                  </Text>
                  <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
                    Show this at the property to check in. If it cannot be scanned, read out the code.
                  </Text>
                  <Text style={[type.caption, { color: colors.kicker }]}>{pass.data.referenceCode}</Text>
                </View>
              ) : (
                <Text style={[type.modalDescription, { color: colors.muted, textAlign: "center" }]}>
                  {pass.error ? errorMessage(pass.error) : "Your pass could not be read. Try again."}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </BottomSheetModal>
  );
}
