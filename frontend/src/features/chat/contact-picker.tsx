import { useMemo } from "react";
import { Text, View } from "react-native";

import { LoadFailedCard, loadFailure } from "@/components/load-failed";
import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard } from "@/components/skeleton";
import { initialsOf } from "@/features/chat/chat-time";
import {
  CHAT_LIVE_OPTIONS,
  useListChatContactsQuery,
  type ChatContact,
} from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { FitText } from "@/components/fit-text";
import { cardName } from "@/lib/person-name";

const ROLE_LABEL: Record<ChatContact["role"], string> = {
  MANAGER: "Manager",
  OWNER: "Owner",
  TENANT: "Tenant",
};

/**
 * Who you can start a one-to-one with.
 *
 * <p>Only ever opens a personal conversation. The team thread with a tenant is
 * reached from their row in the Tenants list, which is why picking a tenant here
 * is unambiguous — it means "message them privately", not "answer them at the
 * desk".
 *
 * <p>A person already spoken to still carries their existing thread, so tapping
 * them opens it rather than making a second one — but nothing SAYS so on the
 * row. A thread that exists with nothing in it is invisible in the list, and a
 * badge claiming otherwise was the two views disagreeing about the same person.
 */
export function ContactPicker({
  onClose,
  onPick,
  propertyId,
  roles,
  // No title over the list (user, 2026-11-14), as on the property sheet.
  title = "",
}: {
  onClose: () => void;
  onPick: (contact: ChatContact) => void;
  propertyId: string;
  /**
   * Which kinds of person this picker is for.
   *
   * <p>The Tenants section offers tenants only, because a manager picked there
   * would open a private one-to-one that then appears in a different section
   * from the one it was started in.
   */
  roles: ChatContact["role"][];
  title?: string;
}) {
  const { colors, type } = useTheme();
  const contactsQuery = useListChatContactsQuery(propertyId, {
    ...CHAT_LIVE_OPTIONS,
    skip: !propertyId,
  });

  const grouped = useMemo(() => {
    const contacts = contactsQuery.data ?? [];
    const order: ChatContact["role"][] = ["OWNER", "MANAGER", "TENANT"];
    return order
      .filter((role) => roles.includes(role))
      .map((role) => ({ people: contacts.filter((contact) => contact.role === role), role }))
      .filter((group) => group.people.length > 0);
  }, [contactsQuery.data, roles]);

  const loadFailed = loadFailure(contactsQuery);
  if (loadFailed) {
    return (
      <SheetShell onClose={onClose} title={title}>
        <LoadFailedCard error={loadFailed.error} onReload={loadFailed.reload} />
      </SheetShell>
    );
  }

  return (
    <SheetShell size="tall" dismissOnDrag onClose={onClose} title={title}>
      {contactsQuery.isLoading ? <SkeletonCard /> : null}

      {!contactsQuery.isLoading && grouped.length === 0 ? (
        <Text style={[type.modalDescription, { color: colors.muted, paddingVertical: spacing.md }]}>
          There is nobody here to start a conversation with yet.
        </Text>
      ) : null}

      {grouped.map((group) => (
        <View key={group.role} style={{ gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>{ROLE_LABEL[group.role]}</Text>
          {group.people.map((contact) => (
            <AnimatedPressable
              accessibilityRole="button"
              key={contact.userId}
              onPress={() => onPick(contact)}
              style={{
                // No box and no lines, the face further left (user, 2026-11-14).
                alignItems: "center",
                borderRadius: 12,
                flexDirection: "row",
                gap: spacing.sm,
                paddingLeft: spacing.xs,
                paddingRight: spacing.sm,
                paddingVertical: spacing.sm,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 34,
                  justifyContent: "center",
                  width: 34,
                }}
              >
                <Text style={{ color: colors.inkSoft, fontSize: 12, fontWeight: "700" }}>
                  {initialsOf(contact.name)}
                </Text>
              </View>
              <FitText numberOfLines={1} style={{ color: colors.ink, flex: 1, fontWeight: "600" }}>
                {cardName(contact.name)}
              </FitText>
            </AnimatedPressable>
          ))}
        </View>
      ))}
    </SheetShell>
  );
}
