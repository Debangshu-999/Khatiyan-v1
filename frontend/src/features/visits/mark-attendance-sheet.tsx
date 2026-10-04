import { useState } from "react";
import { Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { QrCode } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { useCheckInVisitMutation, type VisitCard } from "@/store/services/enquiry-chat-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CODE_LENGTH = 6;

/**
 * Marks a visitor's attendance (user, 2026-10-04): scan the pass on their
 * phone, or type the six digits printed under its QR when it cannot be
 * scanned. Whoever does this takes the visit form with it.
 *
 * <p>The camera reads a code many times a second, so one read pauses the
 * scanner until the server has answered. A refusal is shown and the scanner
 * starts again.
 */
export function MarkAttendanceSheet({
  onCheckedIn,
  onClose,
  visit,
}: {
  /** Handed the visit as it now stands, so the screen can open its form. */
  onCheckedIn: (card: VisitCard) => void;
  onClose: () => void;
  visit: VisitCard;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [checkIn, checkInState] = useCheckInVisitMutation();
  const [code, setCode] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  // Set by a read and cleared by a refusal: nothing is scanned in between.
  const [paused, setPaused] = useState(false);

  const name = visit.prospectName?.trim().split(/\s+/)[0] || "the visitor";
  const scanning = Boolean(permission?.granted) && !paused && !checkInState.isLoading;

  async function submit(payload: { token?: string; code?: string }) {
    try {
      const card = await checkIn({ visitId: visit.visitId, ...payload }).unwrap();
      toast.success(`${visit.prospectName ?? "Visitor"} checked in.`);
      onCheckedIn(card);
    } catch (error) {
      setRefusal(errorMessage(error));
    }
  }

  return (
    <SheetShell onClose={onClose} title="Mark attendance">
      <Text style={[type.modalDescription, { color: colors.muted }]}>Scan the visitor pass on {name}'s phone.</Text>

      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderCurve: "continuous",
          borderRadius: radii.card,
          height: 220,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {permission?.granted ? (
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            onBarcodeScanned={
              scanning
                ? ({ data }) => {
                    setPaused(true);
                    void submit({ token: data });
                  }
                : undefined
            }
            style={{ alignSelf: "stretch", flex: 1 }}
          />
        ) : (
          <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
            <QrCode color={colors.muted} size={28} strokeWidth={2} />
            <Text style={[type.description, { color: colors.muted, textAlign: "center" }]}>
              {permission && !permission.canAskAgain
                ? "The camera is turned off for this app. Enter the code on their pass instead."
                : "Allow the camera to scan the pass."}
            </Text>
            {/* Its own button, sized by its label. ActionButton carries flex: 1
                for the rows it usually shares, and in this column that made it
                stretch tall on a phone. Ink fill, white text (user, 2026-10-04). */}
            {!permission || permission.canAskAgain ? (
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => void requestPermission()}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.ink,
                  borderCurve: "continuous",
                  borderRadius: radii.md,
                  justifyContent: "center",
                  minHeight: 40,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 13 }}>Allow camera</Text>
              </AnimatedPressable>
            ) : null}
          </View>
        )}
      </View>

      {/* Two ways in, with a rule and "or" between them (user, 2026-10-04):
          the scan above, the pass's own code below. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
        <Text style={[type.caption, { color: colors.kicker }]}>or</Text>
        <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
      </View>

      <FormInput
        keyboardType="number-pad"
        label="Visitor pass code"
        maxLength={CODE_LENGTH}
        onChangeText={(text) => setCode(text.replace(/\D/g, ""))}
        placeholder="6 digit code from visitor pass"
        value={code}
      />

      <ActionButton
        disabled={code.length !== CODE_LENGTH || checkInState.isLoading}
        label={checkInState.isLoading ? "Checking in" : "Check in"}
        onPress={() => void submit({ code })}
      />

      {refusal ? (
        <AlertModal
          message={refusal}
          onClose={() => {
            setRefusal(null);
            setPaused(false);
          }}
        />
      ) : null}
    </SheetShell>
  );
}
