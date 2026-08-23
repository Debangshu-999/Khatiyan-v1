import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { ChatAvatar } from "@/features/chat/chat-avatar";
import type { ChatThread } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Which tenant to write to, at the property desk.
 *
 * <p>Separate from {@link ContactPicker} because it opens a different KIND of
 * conversation. The Tenants section is the shared team desk, so picking somebody
 * here opens the thread the whole management side can answer — not a private
 * one-to-one, which would then appear under My chats rather than where it was
 * started.
 *
 * <p>Built from the roster the section already loaded, so it needs no lookup of
 * its own and cannot disagree with the list behind it.
 */
export function TenantPicker({
  onClose,
  onPick,
  tenants,
}: {
  onClose: () => void;
  onPick: (tenant: ChatThread) => void;
  /** Every current tenant, conversation or not. */
  tenants: ChatThread[];
}) {
  const { colors, type } = useTheme();

  return (
    <SheetShell dismissOnDrag onClose={onClose} title="Message a tenant">
      {tenants.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted, paddingVertical: spacing.md }]}>
          There are no active tenants on this property yet.
        </Text>
      ) : null}

      {tenants.map((tenant) => (
        <AnimatedPressable
          accessibilityRole="button"
          key={tenant.originId ?? tenant.title}
          onPress={() => onPick(tenant)}
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
          }}
        >
          <ChatAvatar name={tenant.title} photoUrl={tenant.counterpartPhotoUrl} size={34} />
          <Text numberOfLines={1} style={{ color: colors.ink, flex: 1, fontWeight: "600" }}>
            {tenant.title}
          </Text>
        </AnimatedPressable>
      ))}
    </SheetShell>
  );
}
