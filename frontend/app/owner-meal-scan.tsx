import { useCallback, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Camera, ChevronRight, ClipboardCheck, QrCode, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { foodIcon, MEAL_LABEL } from "@/features/food/food-ui";
import { formatMealMoment } from "@/features/food/meal-pass";
import { MealGlassPanel, ServingMealCard } from "@/features/food/serving-meal-card";
import { highlightPalette } from "@/components/highlight-card";
import { LinearGradient } from "expo-linear-gradient";
import { errorMessage } from "@/features/forms/server-error";
import { FormInput } from "@/features/owner/owner-ui";
import { useRouteGate } from "@/features/owner/route-gates";
import { useAppSelector } from "@/store/hooks";
import {
  useGetMealAttendanceLiveQuery,
  useScanMealPassMutation,
  type MealScanResult,
} from "@/store/services/food-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CODE_LENGTH = 6;
/** A phone held still reads the same QR many times a second. The same one is ignored for this long. */
const SAME_PASS_MS = 4000;

/**
 * The scanner at the counter (user, 2026-11-01). A meal is a queue, so this stays
 * open and takes one pass after another: each read shows who it was, their room
 * and plan so the right food is plated. A pass scanned before says so rather than
 * failing. A refusal is shown and the scanner resumes.
 */
export default function OwnerMealScanScreen() {
  const router = useRouter();
  const { fonts, type } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId) ?? "";
  const { dialog, gate } = useRouteGate(propertyId);
  const live = useGetMealAttendanceLiveQuery(propertyId, { pollingInterval: 15_000, skip: !propertyId });
  const [permission, requestPermission] = useCameraPermissions();
  const [scan, scanState] = useScanMealPassMutation();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [last, setLast] = useState<MealScanResult | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const lastRead = useRef<{ at: number; token: string } | null>(null);
  const submitting = useRef(false);
  const lastCodeAttempt = useRef<string | null>(null);

  // Returning here starts with a quiet frame too, and never leaves a hidden camera running.
  useFocusEffect(useCallback(() => () => setCameraOpen(false), []));

  const header = <ScreenHeader italicTail="meal passes." onDark title="Scan" />;
  const failure = loadFailure(live);
  if (failure) {
    return <LoadFailedScreen failure={failure} />;
  }

  const meal = live.data?.openMeal ?? null;

  async function openCamera() {
    setCameraError(null);
    if (permission?.granted) {
      setCameraOpen(true);
      return;
    }
    if (permission && !permission.canAskAgain) return;
    try {
      const next = await requestPermission();
      setCameraOpen(next.granted);
    } catch {
      setCameraError("The camera could not be opened. Enter the meal pass code instead.");
    }
  }

  async function submit(payload: { token?: string; code?: string }) {
    // The ref closes the gap before React paints the mutation's loading state.
    if (submitting.current) return;
    submitting.current = true;
    setVerifyingCode(Boolean(payload.code));
    setCodeError(null);
    setLast(null);
    try {
      const result = await scan({ propertyId, ...payload }).unwrap();
      setLast(result);
      setCode("");
      lastCodeAttempt.current = null;
    } catch (error) {
      if (payload.code) setCodeError(errorMessage(error));
      else setRefusal(errorMessage(error));
    } finally {
      submitting.current = false;
      setVerifyingCode(false);
    }
  }

  function changeCode(text: string) {
    if (submitting.current) return;
    const next = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(next);
    if (next.length === CODE_LENGTH && next === lastCodeAttempt.current) return;
    setCodeError(null);
    if (next.length < CODE_LENGTH) {
      lastCodeAttempt.current = null;
      return;
    }
    if (!meal) return;
    lastCodeAttempt.current = next;
    void submit({ code: next });
  }

  function onRead(token: string) {
    const now = Date.now();
    const previous = lastRead.current;
    if (submitting.current || scanState.isLoading || refusal || (previous && previous.token === token && now - previous.at < SAME_PASS_MS)) {
      return;
    }
    lastRead.current = { at: now, token };
    void submit({ token });
  }

  return (
    <>
    <StatusBar style="light" />
    {/* The tenant's meal pass colours, plain: no sky, no stars (user, 2026-11-13). */}
    <ScreenScrollView
      background={<LinearGradient colors={highlightPalette.night.gradient} end={{ x: 1, y: 1 }} pointerEvents="none" start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />}
      contentContainerStyle={{ paddingBottom: spacing.lg }}
      safeAreaEdges={["top", "bottom"]}
      surface={highlightPalette.night.gradient[0]}
    >
      {header}
      {live.isLoading ? (
        <SkeletonCard />
      ) : !meal ? (
        <View style={{ backgroundColor: "#EEF2FF", borderRadius: radii.card }}>
          <EmptyState icon={foodIcon("silverware-fork-knife")} title="No meal is being served right now" />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <ServingMealCard glass meal={meal} />
          <View style={{ backgroundColor: "rgba(9, 15, 36, 0.38)", borderColor: "rgba(255, 255, 255, 0.16)", borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: "#090F24",
              borderColor: "rgba(255, 255, 255, 0.2)",
              borderCurve: "continuous",
              borderRadius: radii.card,
              borderWidth: 1,
              height: 220,
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {cameraOpen && permission?.granted ? (
              <>
                <CameraView
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  facing="back"
                  onBarcodeScanned={({ data }) => onRead(data)}
                  style={{ alignSelf: "stretch", flex: 1 }}
                />
                <AnimatedPressable
                  accessibilityLabel="Close camera"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCameraOpen(false)}
                  style={{ alignItems: "center", backgroundColor: "rgba(9, 15, 36, 0.75)", borderColor: "rgba(255, 255, 255, 0.3)", borderRadius: 999, borderWidth: 1, height: 36, justifyContent: "center", position: "absolute", right: spacing.sm, top: spacing.sm, width: 36, zIndex: 1 }}
                >
                  <X color="#FFFFFF" size={18} strokeWidth={2.2} />
                </AnimatedPressable>
              </>
            ) : (
              <View style={{ alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
                {permission && !permission.granted && !permission.canAskAgain ? (
                  <Text style={{ color: "#D9E2FF", fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17, maxWidth: 165, textAlign: "center" }}>
                    The camera is turned off for this app. Enter the code on their pass instead.
                  </Text>
                ) : (
                  <AnimatedPressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => void openCamera()}
                  >
                    <MealGlassPanel compact>
                      <Camera color="#D9E2FF" size={15} strokeWidth={2} />
                      <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 12, lineHeight: 17 }}>Open camera</Text>
                    </MealGlassPanel>
                  </AnimatedPressable>
                )}
              </View>
            )}
            <ScanGuide />
          </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
              <QrCode color="#FFE4AA" size={15} strokeWidth={2} />
              <Text style={{ color: "#D9E2FF", flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 12, textAlign: "center" }}>
                {cameraOpen && permission?.granted ? "Position the QR inside the frame" : "Scan a meal pass"}
              </Text>
            </View>
          {cameraError ? <Text accessibilityLiveRegion="polite" style={{ color: "#FFBEC8", fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17, textAlign: "center" }}>{cameraError}</Text> : null}
          </View>

          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ backgroundColor: "rgba(255, 255, 255, 0.2)", flex: 1, height: 1 }} />
            <Text style={[type.caption, { color: "#D9E2FF" }]}>or enter the code</Text>
            <View style={{ backgroundColor: "rgba(255, 255, 255, 0.2)", flex: 1, height: 1 }} />
          </View>

          <MealGlassPanel>
          <FormInput
            disabled={scanState.isLoading || verifyingCode}
            error={codeError ?? undefined}
            errorColor="#FFBEC8"
            inputStyle={{ color: "#24366A", fontSize: code ? 20 : 14, letterSpacing: code ? 8 : 0, textAlign: code ? "center" : "left" }}
            keyboardType="number-pad"
            label="Meal pass code"
            labelStyle={{ color: "#D9E2FF" }}
            maxLength={CODE_LENGTH}
            onChangeText={changeCode}
            placeholder="6 digit code from meal pass"
            value={code}
          />
          {verifyingCode ? (
            <View accessibilityLiveRegion="polite" style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
              <ActivityIndicator color="#D9E2FF" size="small" />
              <Text style={{ color: "#D9E2FF", fontFamily: fonts.sansMedium, fontSize: 12 }}>Verifying code...</Text>
            </View>
          ) : null}
          </MealGlassPanel>
          {last ? <LastScan scan={last} /> : null}
          <AnimatedPressable
            accessibilityLabel="View meal attendance"
            accessibilityRole="button"
            onPress={() => gate("/owner-meal-attendance", () => router.push("/owner-meal-attendance"))}
          >
            <MealGlassPanel>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <ClipboardCheck color="#FFE4AA" size={20} strokeWidth={2} />
                <Text style={{ color: "#FFFFFF", flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>View meal attendance</Text>
                <ChevronRight color="#D9E2FF" size={18} strokeWidth={2.2} />
              </View>
            </MealGlassPanel>
          </AnimatedPressable>
        </View>
      )}

      {refusal ? (
        <AlertModal
          message={refusal}
          onClose={() => {
            setRefusal(null);
            lastRead.current = null;
          }}
        />
      ) : null}
      {dialog}
    </ScreenScrollView>
    </>
  );
}

/** A visual guide only. The camera continues reading the full preview. */
function ScanGuide() {
  return (
    <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <View style={{ height: 172, width: 172 }}>
        {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => {
          const top = corner.startsWith("top");
          const left = corner.endsWith("Left");
          return <View key={corner} style={{
            borderColor: "#FFE4AA",
            borderTopWidth: top ? 3 : 0,
            borderBottomWidth: top ? 0 : 3,
            borderLeftWidth: left ? 3 : 0,
            borderRightWidth: left ? 0 : 3,
            borderTopLeftRadius: top && left ? 12 : 0,
            borderTopRightRadius: top && !left ? 12 : 0,
            borderBottomLeftRadius: !top && left ? 12 : 0,
            borderBottomRightRadius: !top && !left ? 12 : 0,
            height: 28,
            width: 28,
            position: "absolute",
            ...(top ? { top: 0 } : { bottom: 0 }),
            ...(left ? { left: 0 } : { right: 0 }),
          }} />;
        })}
      </View>
    </View>
  );
}

/** Scan details use the same glass as code entry, with a small status accent only. */
function LastScan({ scan }: { scan: MealScanResult }) {
  const { fonts } = useTheme();
  const ink = scan.alreadyRecorded ? "#FFE4AA" : "#A2E8D0";
  return (
    <View accessibilityLiveRegion="polite">
      <MealGlassPanel>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View style={{ alignItems: "center", backgroundColor: scan.alreadyRecorded ? "rgba(255, 228, 170, 0.1)" : "rgba(162, 232, 208, 0.1)", borderRadius: 999, height: 36, justifyContent: "center", width: 36 }}>
            <MaterialCommunityIcons color={ink} name={scan.alreadyRecorded ? "alert-circle" : "check-circle"} size={23} />
          </View>
          <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 23 }}>
              {scan.tenantName ?? "Tenant"}
            </Text>
            {scan.profileName ? <Text style={{ color: "#D9E2FF", fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18 }}>{scan.profileName}</Text> : null}
            {scan.alreadyRecorded ? <Text style={{ color: ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>Already recorded</Text> : null}
          </View>
        </View>
        <View style={{ borderColor: "rgba(255, 255, 255, 0.16)", borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, paddingTop: spacing.sm }}>
          {[
            { label: "Room", value: scan.roomNumber ?? "Not assigned" },
            { label: "Meal", value: MEAL_LABEL[scan.mealType] },
            { label: "Recorded", value: formatMealMoment(scan.attendedAt) },
          ].map(({ label, value }) => (
            <View key={label} style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Text style={{ color: "#D9E2FF", fontFamily: fonts.sansMedium, fontSize: 11.5 }}>{label}</Text>
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 18 }}>{value}</Text>
            </View>
          ))}
        </View>
      </MealGlassPanel>
    </View>
  );
}
