import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle, MessageCirclePlus } from "lucide-react-native";

/**
 * Clearance for the floating button: the tab bar's own height plus whatever
 * gesture inset sits under it, plus a little air.
 */
const TAB_BAR_HEIGHT_PX = 60;

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ContactPicker } from "@/features/chat/contact-picker";
import { TenantPicker } from "@/features/chat/tenant-picker";
import { ThreadRow } from "@/features/chat/thread-row";
import { errorMessage } from "@/features/forms/server-error";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import {
  CHAT_LIVE_OPTIONS,
  THREAD_LIST_POLL_MS,
  useListEnquiryThreadsQuery,
  useListMyThreadsQuery,
  useListPersonalThreadsQuery,
  useListTenantThreadsQuery,
  useOpenDirectThreadMutation,
  useOpenTeamThreadMutation,
  type ChatThread,
} from "@/store/services/chat-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Section = "TENANTS" | "MINE" | "ENQUIRIES";

/**
 * The conversation route, carrying its own header text.
 *
 * <p>Passed as params rather than refetched on the other side: the list already
 * knows the title, and a header that arrives a beat after the screen reads as a
 * flicker on every open.
 */
function threadRoute(
  threadId: string,
  thread: Pick<ChatThread, "counterpartPhotoUrl" | "counterpartUserId" | "kind" | "title">,
  subtitle?: string | null,
) {
  const query = new URLSearchParams({ title: thread.title });
  if (subtitle) {
    query.set("subtitle", subtitle);
  }
  if (thread.counterpartPhotoUrl) {
    query.set("photo", thread.counterpartPhotoUrl);
  }
  // Only when the other side is the PROPERTY. Management opening a tenant's
  // team thread is looking at a person, and flashing a building for one frame
  // before the server answers is a wrong first impression of whose chat it is.
  if (thread.kind === "TEAM" && thread.counterpartUserId === null) {
    query.set("team", "1");
  }
  return `/chat/${threadId}?${query.toString()}`;
}

/**
 * Conversations.
 *
 * <p>Three audiences, one screen. Management sees the property's sections;
 * a tenant sees their own list with the property management thread pinned; a
 * non-tenant user sees only the enquiries they were answered in.
 */
export default function ChatScreen() {
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const isManagement = activeAccount === "owner" || activeAccount === "manager";

  return isManagement ? <ManagementChats /> : <PersonalChats />;
}

// ---------------------------------------------------------------------------
// Owner and managers
// ---------------------------------------------------------------------------

function ManagementChats() {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();

  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const properties = [...ownedProperties, ...managedProperties];
  const property =
    properties.find((candidate) => candidate.id === selectedPropertyId) ??
    (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";

  const [section, setSection] = useState<Section>("TENANTS");
  const [pickerOpen, setPickerOpen] = useState(false);

  // A conversation list is the one screen where stale is indistinguishable from
  // wrong: the cached copy has yesterday's previews, yesterday's unread flags
  // and yesterday's names, with nothing on the page to hint that it is old. So
  // it refetches on open, on returning to the app, on reconnect — and polls,
  // because a conversation somebody else starts arrives with no local event to
  // react to.
  const fresh = {
    ...CHAT_LIVE_OPTIONS,
    pollingInterval: THREAD_LIST_POLL_MS,
    skip: !propertyId,
  };
  const tenants = useListTenantThreadsQuery(propertyId, fresh);
  const mine = useListPersonalThreadsQuery(propertyId, fresh);
  const enquiries = useListEnquiryThreadsQuery(propertyId, fresh);
  const [openTeamThread] = useOpenTeamThreadMutation();
  const [openDirectThread] = useOpenDirectThreadMutation();

  const active =
    section === "TENANTS" ? tenants : section === "MINE" ? mine : enquiries;

  // The server sends every current tenant so the picker can offer them, but the
  // LIST only shows conversations that exist. A screen of "tap to start" rows is
  // a directory wearing an inbox's clothes, and it buries the two threads that
  // actually want reading.
  const threads = (active.data ?? []).filter((thread) => Boolean(thread.lastMessageAt));

  /**
   * A roster row has no thread until somebody writes, so opening one may have
   * to create it first. The mutation returns the row, which is what carries the
   * id we then navigate to.
   */
  async function openThread(thread: ChatThread) {
    if (thread.id) {
      router.push(threadRoute(thread.id, thread));
      return;
    }
    if (!thread.originId) {
      return;
    }

    try {
      const opened = await openTeamThread(thread.originId).unwrap();
      if (opened.id) {
        router.push(threadRoute(opened.id, opened));
      }
    } catch (error) {
      toast.error(errorMessage(error) || "Could not open this conversation.");
    }
  }

  async function startDirect(withUserId: string, existingThreadId: string | null) {
    setPickerOpen(false);
    if (existingThreadId) {
      router.push(`/chat/${existingThreadId}`);
      return;
    }

    try {
      const opened = await openDirectThread({ propertyId, withUserId }).unwrap();
      if (opened.id) {
        router.push(threadRoute(opened.id, opened));
      }
    } catch (error) {
      toast.error(errorMessage(error) || "Could not start this conversation.");
    }
  }

  if (!property) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
        <EmptyState
          description="Choose an active property from Home to see its conversations."
          icon={MessageCircle}
          title="No property selected"
        />
      </ScreenScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScreenScrollView
      // The shared default invalidates a fixed set of tags that does not
      // include Chat, so without this the pull gesture spun and changed
      // nothing on the one screen where people reach for it most.
      onRefresh={async () => {
        await Promise.all([tenants.refetch(), mine.refetch(), enquiries.refetch()]);
      }}
      safeAreaEdges={["top", "bottom"]}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.3 }}>
          Chats
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
          {property.name}
        </Text>
      </View>

      {/* Pills rather than tabs: Enquiries is empty until that module is wired,
          and an empty TAB reads as something failing to load where an
          unselected pill reads as a place you have not gone. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <SectionPill
          count={tenants.data?.filter((thread) => thread.unread).length ?? 0}
          label="Tenants"
          onPress={() => setSection("TENANTS")}
          selected={section === "TENANTS"}
        />
        <SectionPill
          count={mine.data?.filter((thread) => thread.unread).length ?? 0}
          label="My chats"
          onPress={() => setSection("MINE")}
          selected={section === "MINE"}
        />
        <SectionPill
          count={enquiries.data?.filter((thread) => thread.unread).length ?? 0}
          label="Enquiries"
          onPress={() => setSection("ENQUIRIES")}
          selected={section === "ENQUIRIES"}
        />
      </View>

      {active.isLoading ? <SkeletonCard /> : null}

      {!active.isLoading && threads.length === 0 ? (
        <EmptyState
          compact
          description={emptyCopy(section)}
          icon={MessageCircle}
          title={emptyTitle(section)}
        />
      ) : null}

      {threads.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // Top only. Every row draws its own rule underneath, so a border
            // here as well would double the line at the foot of the list.
            borderTopColor: colors.border,
            borderTopWidth: 1,
            // Cancels the screen gutter so the rows run edge to edge. A list of
            // conversations is the screen, not a card sitting on it, and a
            // rounded box around it turns each row into an entry in a widget.
            marginHorizontal: -spacing.lg,
          }}
        >
          {threads.map((thread, at) => (
            <View key={thread.id ?? thread.originId ?? String(at)}>
              <ThreadRow onPress={() => void openThread(thread)} thread={thread} />
            </View>
          ))}
        </View>
      ) : null}

    </ScreenScrollView>

      {/* Pinned to the screen rather than the scroll content: a list you scroll
          to the bottom of should not scroll its own "start something new" away.
          Sits outside ScreenScrollView so the tab bar does not cover it. */}
      {section !== "ENQUIRIES" ? (
        <NewChatButton onPress={() => setPickerOpen(true)} />
      ) : null}

      {/* Two pickers, because the sections open two different KINDS of thread.
          Tenants opens the shared team desk; My chats opens a private
          one-to-one. Using one picker for both would have quietly created a
          personal chat from the Tenants section, which then appears under My
          chats — started in one place, filed in another. */}
      {pickerOpen && section === "TENANTS" ? (
        <TenantPicker
          onClose={() => setPickerOpen(false)}
          onPick={(tenant) => {
            setPickerOpen(false);
            void openThread(tenant);
          }}
          tenants={tenants.data ?? []}
        />
      ) : null}

      {pickerOpen && section === "MINE" ? (
        <ContactPicker
          onClose={() => setPickerOpen(false)}
          onPick={(contact) => void startDirect(contact.userId, contact.existingThreadId)}
          propertyId={propertyId}
          roles={["OWNER", "MANAGER", "TENANT"]}
        />
      ) : null}
    </View>
  );
}

/**
 * The floating "New chat" action.
 *
 * <p>Bottom right, clear of the tab bar and whatever gesture inset sits under
 * it. Labelled rather than a bare plus: this screen has three sections and the
 * button does something slightly different in each, so a naked icon would be
 * asking the reader to guess.
 */
function NewChatButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <AnimatedPressable
      accessibilityLabel="Start a new chat"
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.ink,
        borderRadius: 999,
        // Clear of the tab bar by more than a hair, so the two do not read
        // as one stacked control.
        bottom: TAB_BAR_HEIGHT_PX + insets.bottom + spacing.lg,
        elevation: 4,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        position: "absolute",
        right: spacing.md,
        shadowColor: "#000",
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 8,
      }}
    >
      {/* The tab's own bubble with a plus in it, rather than a bare plus:
          the button sits on a list of conversations, where a lone + could as
          easily mean a new property or a new tenant. */}
      <MessageCirclePlus color={colors.surface} size={18} strokeWidth={2.3} />
      <Text style={{ color: colors.surface, fontSize: 13, fontWeight: "700" }}>New chat</Text>
    </AnimatedPressable>
  );
}

function emptyTitle(section: Section) {
  if (section === "TENANTS") {
    return "No tenant conversations";
  }
  return section === "MINE" ? "No personal chats" : "No enquiry chats";
}

function emptyCopy(section: Section) {
  if (section === "TENANTS") {
    return "Messages from your tenants appear here. Start one with New chat.";
  }
  if (section === "MINE") {
    return "Start one with the owner, a manager or a tenant using New chat.";
  }
  return "Enquiries answered over chat will appear here.";
}

function SectionPill({
  count,
  label,
  onPress,
  selected,
}: {
  count: number;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.ink : colors.surface,
        borderColor: selected ? colors.ink : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: selected ? colors.surface : colors.inkSoft, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
      {count > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: selected ? colors.surface : colors.primary,
            borderRadius: 999,
            minWidth: 17,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}
        >
          <Text style={{ color: selected ? colors.ink : colors.surface, fontSize: 10, fontWeight: "700" }}>
            {count}
          </Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------
// Tenants and everybody else
// ---------------------------------------------------------------------------

function PersonalChats() {
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();

  const threadsQuery = useListMyThreadsQuery(undefined, {
    ...CHAT_LIVE_OPTIONS,
    pollingInterval: THREAD_LIST_POLL_MS,
  });
  // The endpoint wraps three things; the stay and the property are both needed
  // — the stay to open the thread, the property to name it before one exists.
  const active = useGetMyActiveTenancyQuery().data;
  const tenancy = active?.tenancy ?? null;
  const property = active?.property ?? null;
  const [openTeamThread] = useOpenTeamThreadMutation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openDirectThread] = useOpenDirectThreadMutation();

  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const teamThread = threads.find((thread) => thread.kind === "TEAM") ?? null;
  const others = threads.filter((thread) => thread.kind !== "TEAM");

  /**
   * The pinned row exists because the tenancy does, not because a conversation
   * does — so when nothing has been said there is no thread to link to and the
   * row has to be invented here, exactly as the server invents the roster rows
   * on the other side.
   */
  const pinned: ChatThread | null =
    teamThread ??
    (tenancy
      ? {
          counterpartLastReadSeq: 0,
          counterpartPhotoUrl: null,
          counterpartUserId: null,
          id: null,
          kind: "TEAM",
          lastMessageAt: null,
          lastMessageKind: null,
          lastMessagePreview: null,
          lastMessageSeq: 0,
          origin: "TENANCY",
          originId: tenancy.id,
          propertyId: tenancy.propertyId,
          status: "OPEN",
          // The property, because that is who the tenant is writing to. Once a
          // thread exists the server sends the same name, so the row does not
          // change identity the moment somebody speaks.
          title: property?.name ?? "Property management team",
          unread: false,
        }
      : null);

  async function openPinned() {
    if (pinned?.id) {
      router.push(threadRoute(pinned.id, pinned, "Property management team"));
      return;
    }
    if (!tenancy) {
      return;
    }

    try {
      const opened = await openTeamThread(tenancy.id).unwrap();
      if (opened.id) {
        router.push(threadRoute(opened.id, opened, "Property management team"));
      }
    } catch (error) {
      toast.error(errorMessage(error) || "Could not open this conversation.");
    }
  }

  async function startDirect(withUserId: string, existingThreadId: string | null) {
    setPickerOpen(false);
    if (existingThreadId) {
      router.push(`/chat/${existingThreadId}`);
      return;
    }
    if (!tenancy) {
      return;
    }

    try {
      const opened = await openDirectThread({
        propertyId: tenancy.propertyId,
        withUserId,
      }).unwrap();
      if (opened.id) {
        router.push(threadRoute(opened.id, opened));
      }
    } catch (error) {
      toast.error(errorMessage(error) || "Could not start this conversation.");
    }
  }

  const nothingAtAll = !pinned && others.length === 0 && !threadsQuery.isLoading;

  return (
    <View style={{ flex: 1 }}>
    <ScreenScrollView
      onRefresh={async () => {
        await threadsQuery.refetch();
      }}
      safeAreaEdges={["top", "bottom"]}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.3 }}>
        Chats
      </Text>

      {threadsQuery.isLoading ? <SkeletonCard /> : null}

      {nothingAtAll ? (
        <EmptyState
          description="Conversations with a property you rent, or about an enquiry you sent, appear here."
          icon={MessageCircle}
          title="No conversations yet"
        />
      ) : null}

      {pinned || others.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // Top only. Every row draws its own rule underneath, so a border
            // here as well would double the line at the foot of the list.
            borderTopColor: colors.border,
            borderTopWidth: 1,
            // Cancels the screen gutter so the rows run edge to edge. A list of
            // conversations is the screen, not a card sitting on it, and a
            // rounded box around it turns each row into an entry in a widget.
            marginHorizontal: -spacing.lg,
          }}
        >
          {pinned ? (
            <ThreadRow
              onPress={() => void openPinned()}
              subtitle="Property management team"
              thread={pinned}
            />
          ) : null}
          {others.map((thread) => (
            <ThreadRow
              key={thread.id ?? thread.originId}
              onPress={() =>
                thread.id &&
                router.push(
                  threadRoute(thread.id, thread, thread.origin === "ENQUIRY" ? "Enquiry" : null),
                )
              }
              subtitle={thread.origin === "ENQUIRY" ? "Enquiry" : null}
              thread={thread}
            />
          ))}
        </View>
      ) : null}

    </ScreenScrollView>

      {/* Only a tenant has anyone to write to. A non-tenant user is here because
          somebody answered their enquiry, and there is nobody for them to start
          a conversation with — so the button is absent rather than disabled. */}
      {tenancy ? <NewChatButton onPress={() => setPickerOpen(true)} /> : null}

      {pickerOpen && tenancy ? (
        <ContactPicker
          onClose={() => setPickerOpen(false)}
          onPick={(contact) => void startDirect(contact.userId, contact.existingThreadId)}
          propertyId={tenancy.propertyId}
          // A tenant reaches management and nobody else. Tenant-to-tenant is the
          // one direction that would need moderating, and nothing needs it.
          roles={["OWNER", "MANAGER"]}
          title="Message management"
        />
      ) : null}
    </View>
  );
}
