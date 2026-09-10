import { Modal, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { StatusIcon } from "@/components/status-icon";
import type {
  TenancyExitRequest,
  TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";
import { DIALOG_MAX_WIDTH, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type RequestBlock = {
  message: string;
  referenceCode: string;
  title: string;
};

export function isBlockingExitRequest(request: TenancyExitRequest) {
  return request.status === "REQUESTED"
    || request.status === "APPROVED"
    || request.status === "WITHDRAWAL_REQUESTED";
}

export function isBlockingRoomChangeRequest(request: TenancyRoomChangeRequest) {
  return request.status === "REQUESTED" || request.status === "APPROVED";
}

export function roomChangeRequestBlock(
  exitRequests: TenancyExitRequest[] = [],
  roomChangeRequests: TenancyRoomChangeRequest[] = [],
  tenancyId?: string,
): RequestBlock | null {
  const belongsToStay = (request: { tenancyId: string }) => !tenancyId || request.tenancyId === tenancyId;
  const roomChange = roomChangeRequests.find(
    (request) => belongsToStay(request) && isBlockingRoomChangeRequest(request),
  );
  if (roomChange) {
    return {
      message: roomChange.status === "APPROVED"
        ? "This room change is approved and scheduled. Another room change cannot be raised until it executes or management returns it for a new decision."
        : "This room change is waiting for management. Another room change cannot be raised until it is rejected or expires.",
      referenceCode: roomChange.referenceCode,
      title: "A room change is already active",
    };
  }

  const exit = exitRequests.find((request) => belongsToStay(request) && isBlockingExitRequest(request));
  if (!exit) {
    return null;
  }
  return {
    message: exit.status === "REQUESTED"
      ? "Your exit request is waiting for management. A room change cannot be raised unless that exit is rejected or expires."
      : "Your exit remains active. A room change cannot be raised until the exit is withdrawn, rejected, or completed.",
    referenceCode: exit.referenceCode,
    title: "Your exit request blocks a room change",
  };
}

export function exitRequestBlock(
  exitRequests: TenancyExitRequest[] = [],
  roomChangeRequests: TenancyRoomChangeRequest[] = [],
  tenancyId?: string,
): RequestBlock | null {
  const belongsToStay = (request: { tenancyId: string }) => !tenancyId || request.tenancyId === tenancyId;
  const exit = exitRequests.find((request) => belongsToStay(request) && isBlockingExitRequest(request));
  if (exit) {
    return {
      message: exit.status === "REQUESTED"
        ? "This exit request is waiting for management. Another exit cannot be raised until it is rejected or expires."
        : "This exit remains active. Another exit cannot be raised until it is withdrawn, rejected, or completed.",
      referenceCode: exit.referenceCode,
      title: "An exit request is already active",
    };
  }

  const roomChange = roomChangeRequests.find(
    (request) => belongsToStay(request) && isBlockingRoomChangeRequest(request),
  );
  if (!roomChange) {
    return null;
  }
  return {
    message: roomChange.status === "APPROVED"
      ? "Your room change is approved and scheduled. An exit request cannot be raised until it executes or management returns it for a new decision."
      : "Your room change is waiting for management. An exit request cannot be raised unless that room change is rejected or expires.",
    referenceCode: roomChange.referenceCode,
    title: "Your room change blocks an exit",
  };
}

/**
 * An up-front workflow block, rather than a submit-time failure after the
 * tenant has completed a form. The backdrop deliberately has no press handler:
 * the person must choose a visible action.
 */
export function RequestBlockedModal({
  block,
  onClose,
  onViewRequests,
}: {
  block: RequestBlock;
  onClose: () => void;
  onViewRequests: () => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
            <StatusIcon size={40} tone="warning" />
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>REQUEST BLOCKED</Text>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 21,
                  lineHeight: 26,
                }}
              >
                {block.title}
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.neutralSoft,
                borderRadius: 999,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <X color={colors.ink} size={18} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>

          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderCurve: "continuous",
              borderRadius: 14,
              gap: spacing.xs,
              padding: spacing.md,
            }}
          >
            <Text style={[type.eyebrow, { color: colors.kicker }]}>ACTIVE REQUEST</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {block.referenceCode}
            </Text>
            <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]}>
              {block.message}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ModalButton label="Close" onPress={onClose} secondary />
            <ModalButton label="View My Requests" onPress={onViewRequests} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModalButton({
  label,
  onPress,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: secondary ? colors.surfaceSunken : colors.primary,
        borderColor: secondary ? colors.border : colors.primary,
        borderCurve: "continuous",
        borderRadius: 13,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: secondary ? colors.ink : colors.onPrimary,
          fontFamily: fonts.sansBold,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
