import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BellRing, MessageCircle, MessageCirclePlus, UsersRound, type LucideProps } from "lucide-react-native";
import OwnerNudgesScreen from "../owner-nudges";
import NudgesScreen from "../nudges";

/**
 * Clearance for the floating button: the tab bar's own height plus whatever
 * gesture inset sits under it, plus a little air.
 */
const TAB_BAR_HEIGHT_PX = 60;

import { threadRoute } from "@/features/chat/thread-route";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ChatThreadListSkeleton } from "@/components/skeletons";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { ChatAccessListSheet } from "@/features/chat/chat-access-list-sheet";
import { ContactPicker } from "@/features/chat/contact-picker";
import { TenantPicker } from "@/features/chat/tenant-picker";
import { ThreadRow } from "@/features/chat/thread-row";
import { arrivalSide, useSectionSwipe } from "@/features/chat/use-section-swipe";
import { SlideInView } from "@/components/slide-in-view";
import { useDeleteThreadSelection } from "@/features/chat/use-delete-thread-selection";
import { errorMessage } from "@/features/forms/server-error";
import { NudgeSheet } from "@/features/nudge/nudge-sheet";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
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
import { NUDGE_REFETCH_OPTIONS, useGetNudgeUnreadCountQuery } from "@/store/services/nudge-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_CHATS_ILLUSTRATION = require("../../assets/empty-states/No-Chats_512x512.png");

type Section = "TENANTS" | "MINE" | "ENQUIRIES" | "NUDGES";
type PersonalSection = "MINE" | "ENQUIRIES" | "NUDGES";

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
  const selection = useDeleteThreadSelection();
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

  // My chats first. The person's own conversations are what they open the tab
  // for most often, and the Tenants desk is one tap away.
  const [section, setSection] = useState<Section>("MINE");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accessListOpen, setAccessListOpen] = useState(false);
  const [nudgeSheetOpen, setNudgeSheetOpen] = useState(false);
  const dispatch = useAppDispatch();

  const isOwner = useAppSelector((state) => state.account.activeAccount) === "owner";
  const permissions = usePropertyPermissions(propertyId);

  /**
   * Whether this account may work the property's tenant conversations.
   *
   * <p>
   * The owner always may, and knows it locally, so there is nothing to wait for.
   * A manager holds it only through the chat access list, which writes the CHATS
   * grant the server already checks.
   *
   * <p>
   * <b>Waits for `isReady` rather than assuming MANAGE</b>, which is the
   * opposite of what `usePropertyPermissions` does elsewhere. There the
   * optimistic answer stops a whole workspace blanking on a cold start. Here it
   * would show a manager a Tenants pill, fire a request the server refuses, and
   * then take the pill away again. Appearing a beat late is the better of the
   * two.
   */
  const canSeeTenants = isOwner || (permissions.isReady && permissions.canManage("CHATS"));

  // A manager without access must not be left standing on the section that
  // opens by default.
  useEffect(() => {
    if (!canSeeTenants && section === "TENANTS") {
      setSection("MINE");
    }
  }, [canSeeTenants, section]);

  // Sections swipe as well as tap (user, 2026-10-02); either way the new one
  // slides in from the side it lies on.
  const sectionOrder: Section[] = canSeeTenants ? ["MINE", "TENANTS", "ENQUIRIES", "NUDGES"] : ["MINE", "ENQUIRIES", "NUDGES"];
  const [arrivedFrom, setArrivedFrom] = useState<"left" | "right" | "none">("none");
  function goToSection(next: Section, from: "left" | "right" = arrivalSide(sectionOrder, section, next)) {
    if (next === section) return;
    setArrivedFrom(from);
    setSection(next);
  }
  const swipeHandlers = useSectionSwipe(sectionOrder, section, goToSection);

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
  // Not asked at all without access. The server refuses it, and this query
  // polls, so a refusal would repeat every few seconds for as long as the
  // screen is open.
  const tenants = useListTenantThreadsQuery(propertyId, { ...fresh, skip: !propertyId || !canSeeTenants });
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
      <ScreenScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        safeAreaEdges={["top", "bottom"]}
        surface={colors.chatSurface}
      >
        <CentredEmpty>
          <EmptyState
            compact
            description="Choose an active property from Home to see its conversations."
            icon={MessageCircle}
            title="No property selected"
          />
        </CentredEmpty>
      </ScreenScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }} {...swipeHandlers}>
    <ScreenScrollView
      // The shared default invalidates a fixed set of tags that does not
      // include Chat, so without this the pull gesture spun and changed
      // nothing on the one screen where people reach for it most.
      contentContainerStyle={{ flexGrow: 1 }}
      onRefresh={async () => {
        // The sent nudges are fetched by the embedded section, not here, so
        // they are refreshed by their tag.
        dispatch(api.util.invalidateTags(["Nudge"]));
        await Promise.all([tenants.refetch(), mine.refetch(), enquiries.refetch()]);
      }}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.chatSurface}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.3 }}>
            Chats
          </Text>
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
            {property.name}
          </Text>
        </View>

      </View>

      {/* Pills rather than tabs: Enquiries is empty until that module is wired,
          and an empty TAB reads as something failing to load where an
          unselected pill reads as a place you have not gone. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <SectionPill
          count={mine.data?.filter((thread) => thread.unread).length ?? 0}
          label="My chats"
          onPress={() => goToSection("MINE")}
          selected={section === "MINE"}
        />
        {canSeeTenants ? (
          <SectionPill
            count={tenants.data?.filter((thread) => thread.unread).length ?? 0}
            label="Tenants"
            onPress={() => goToSection("TENANTS")}
            selected={section === "TENANTS"}
          />
        ) : null}
        <SectionPill
          count={enquiries.data?.filter((thread) => thread.unread).length ?? 0}
          label="Enquiries"
          onPress={() => goToSection("ENQUIRIES")}
          selected={section === "ENQUIRIES"}
        />
        <SectionPill count={0} label="Nudges" onPress={() => goToSection("NUDGES")} selected={section === "NUDGES"} />
      </View>

      <SlideInView from={arrivedFrom} key={section}>
      {section === "NUDGES" ? <OwnerNudgesScreen embedded /> : null}
      {section !== "NUDGES" && active.isLoading ? <ChatThreadListSkeleton /> : null}

      {section !== "NUDGES" && !active.isLoading && threads.length === 0 ? (
        <CentredEmpty>
          <EmptyState
            compact
            description={emptyCopy(section)}
            artwork={NO_CHATS_ILLUSTRATION}
            title={emptyTitle(section)}
          />
        </CentredEmpty>
      ) : null}

      {section !== "NUDGES" && threads.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // Cancels the screen gutter so the rows run edge to edge. A list of
            // conversations is the screen, not a card sitting on it, and a
            // rounded box around it turns each row into an entry in a widget.
            marginHorizontal: -spacing.lg,
          }}
        >
          {threads.map((thread, at) => (
            <View key={thread.id ?? thread.originId ?? String(at)}>
              <ThreadRow
                onLongPress={thread.id ? () => selection.select(thread.id!) : undefined}
                onPress={() =>
                  selection.selectedId ? selection.clear() : void openThread(thread)
                }
                onDelete={selection.ask}
                selected={selection.selectedId === thread.id}
                thread={thread}
              />
            </View>
          ))}
        </View>
      ) : null}
      </SlideInView>

    </ScreenScrollView>

      {/* Pinned to the screen rather than the scroll content: a list you scroll
          to the bottom of should not scroll its own "start something new" away.
          Sits outside ScreenScrollView so the tab bar does not cover it. */}
      <FloatingActions>
        {/* The Nudges section lists what was sent. Sending starts here, on a
            sheet: the tenants first, then the message for the one picked. */}
        {section === "NUDGES" ? (
          <FloatingAction
            accessibilityLabel="Nudge a tenant"
            icon={BellRing}
            label="Nudge"
            onPress={() => setNudgeSheetOpen(true)}
          />
        ) : null}
        {section !== "ENQUIRIES" && section !== "NUDGES" ? (
          <FloatingAction
            accessibilityLabel="Start a new chat"
            icon={MessageCirclePlus}
            label="New chat"
            onPress={() => setPickerOpen(true)}
          />
        ) : null}
        {/* Under New chat, and only here. Who may read the tenant desk is a
            question about THIS list, so it is asked beside the list rather than
            in a settings screen two taps away. Owner only, because granting is
            never a manager to do. */}
        {section === "TENANTS" && isOwner ? (
          <FloatingAction
            accessibilityLabel="Open the chat access list"
            icon={UsersRound}
            label="Access list"
            onPress={() => setAccessListOpen(true)}
          />
        ) : null}
      </FloatingActions>

      {nudgeSheetOpen && propertyId ? (
        <NudgeSheet onClose={() => setNudgeSheetOpen(false)} propertyId={propertyId} />
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

      {accessListOpen && propertyId ? (
        <ChatAccessListSheet onClose={() => setAccessListOpen(false)} propertyId={propertyId} />
      ) : null}
      {selection.dialog}
    </View>
  );
}

/**
 * Holds an empty state in the middle of the space left under the header.
 *
 * <p>Needs the scroll content to grow to the screen (flexGrow: 1 on the
 * ScreenScrollView's content). The empty state used to sit straight under the
 * section pills, leaving the bottom half of the screen blank.
 */
function CentredEmpty({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>;
}

/**
 * The floating actions, stacked at the bottom right.
 *
 * <p>
 * One container anchored to the bottom rather than a bottom offset per button:
 * the stack grows upward from a single point, so the last child always sits in
 * the same place and adding one can never leave two buttons overlapping.
 *
 * <p>
 * `box-none` so the space between and around the pills stays scrollable. An
 * absolute layer over the list would otherwise swallow every touch in the
 * bottom corner of the screen.
 */
function FloatingActions({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        alignItems: "flex-end",
        // Clear of the tab bar by more than a hair, so the two do not read
        // as one stacked control.
        bottom: TAB_BAR_HEIGHT_PX + insets.bottom + spacing.lg,
        gap: spacing.sm,
        position: "absolute",
        right: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

/**
 * One floating pill.
 *
 * <p>Labelled rather than a bare icon: this screen has three sections and two
 * actions, and a naked glyph in the corner would be asking the reader to guess
 * which one it is.
 */
function FloatingAction({
  accessibilityLabel,
  icon: Icon,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  icon: (props: LucideProps) => ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.ink,
        borderRadius: 999,
        elevation: 4,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        shadowColor: "#000",
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 8,
      }}
    >
      <Icon color={colors.surface} size={18} strokeWidth={2.3} />
      <Text style={{ color: colors.surface, fontSize: 13, fontWeight: "700" }}>{label}</Text>
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
  const selection = useDeleteThreadSelection();
  const { colors, fonts, type } = useTheme();
  const router = useGuardedRouter();
  const toast = useToast();
  const nudgeUnread = useGetNudgeUnreadCountQuery(undefined, NUDGE_REFETCH_OPTIONS);

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
  // The same split management has: a person's own conversations, and the
  // enquiries a property answered. One list mixed both, so the chat with the
  // place someone lives sat among conversations about places they only asked
  // about.
  const personal = threads.filter((thread) => thread.kind !== "TEAM" && thread.origin !== "ENQUIRY");
  const enquiries = threads.filter((thread) => thread.origin === "ENQUIRY");

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
          pendingAgreement: false,
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

  // Opens on My chats for a tenant or anyone with a personal chat. Someone who
  // only ever enquired has nothing there, so they open on Enquiries instead.
  const [chosenSection, setChosenSection] = useState<PersonalSection | null>(null);
  const section: PersonalSection =
    chosenSection ?? (pinned || personal.length > 0 || enquiries.length === 0 ? "MINE" : "ENQUIRIES");
  const others = section === "MINE" ? personal : enquiries;
  const personalOrder: PersonalSection[] = ["MINE", "ENQUIRIES", "NUDGES"];
  const [personalArrivedFrom, setPersonalArrivedFrom] = useState<"left" | "right" | "none">("none");
  function goToPersonal(next: PersonalSection, from: "left" | "right" = arrivalSide(personalOrder, section, next)) {
    if (next === section) return;
    setPersonalArrivedFrom(from);
    setChosenSection(next);
  }
  const personalSwipe = useSectionSwipe(personalOrder, section, goToPersonal);
  const showPinned = section === "MINE" ? pinned : null;
  const sectionEmpty = section !== "NUDGES" && !showPinned && others.length === 0 && !threadsQuery.isLoading;

  return (
    <View style={{ flex: 1 }} {...personalSwipe}>
    <ScreenScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      onRefresh={async () => {
        await threadsQuery.refetch();
      }}
      safeAreaEdges={["top", "bottom"]}
      surface={colors.chatSurface}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Text
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: fonts.display,
            fontSize: 26,
            letterSpacing: -0.3,
          }}
        >
          Chats
        </Text>

      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <SectionPill
          count={(pinned?.unread ? 1 : 0) + personal.filter((thread) => thread.unread).length}
          label="My chats"
          onPress={() => goToPersonal("MINE")}
          selected={section === "MINE"}
        />
        <SectionPill
          count={enquiries.filter((thread) => thread.unread).length}
          label="Enquiries"
          onPress={() => goToPersonal("ENQUIRIES")}
          selected={section === "ENQUIRIES"}
        />
        <SectionPill
          count={nudgeUnread.data ?? 0}
          label="Nudges"
          onPress={() => goToPersonal("NUDGES")}
          selected={section === "NUDGES"}
        />
      </View>

      <SlideInView from={personalArrivedFrom} key={section}>
      {section === "NUDGES" ? <NudgesScreen embedded /> : null}
      {section !== "NUDGES" && threadsQuery.isLoading ? <ChatThreadListSkeleton /> : null}

      {sectionEmpty ? (
        <CentredEmpty>
          <EmptyState
            compact
            description={
              section === "MINE"
                ? "Conversations with the property you rent appear here."
                : "When a property answers your enquiry over chat, it appears here."
            }
            artwork={NO_CHATS_ILLUSTRATION}
            title={section === "MINE" ? "No chats yet" : "No enquiry chats"}
          />
        </CentredEmpty>
      ) : null}

      {section !== "NUDGES" && (showPinned || others.length > 0) ? (
        <View
          style={{
            backgroundColor: colors.surface,
            // No rule above the first row (user, 2026-09-27): the chips sit
            // straight on the list. Rows still draw their own rule underneath.
            // Cancels the screen gutter so the rows run edge to edge. A list of
            // conversations is the screen, not a card sitting on it, and a
            // rounded box around it turns each row into an entry in a widget.
            marginHorizontal: -spacing.lg,
          }}
        >
          {showPinned ? (
            <ThreadRow
              onLongPress={showPinned.id ? () => selection.select(showPinned.id!) : undefined}
              onPress={() => (selection.selectedId ? selection.clear() : void openPinned())}
              onDelete={selection.ask}
                selected={selection.selectedId === showPinned.id}
              thread={showPinned}
            />
          ) : null}
          {others.map((thread) => (
            <ThreadRow
              key={thread.id ?? thread.originId}
              onLongPress={thread.id ? () => selection.select(thread.id!) : undefined}
              onPress={() => {
                if (selection.selectedId) {
                  selection.clear();
                  return;
                }
                if (thread.id) {
                  router.push(
                    threadRoute(thread.id, thread, thread.origin === "ENQUIRY" ? "Enquiry" : null),
                  );
                }
              }}
              onDelete={selection.ask}
                selected={selection.selectedId === thread.id}
              subtitle={thread.origin === "ENQUIRY" ? "Enquiry" : null}
              thread={thread}
            />
          ))}
        </View>
      ) : null}
      </SlideInView>

    </ScreenScrollView>

      {/* Only a tenant has anyone to write to. A non-tenant user is here because
          somebody answered their enquiry, and there is nobody for them to start
          a conversation with — so the button is absent rather than disabled. */}
      {tenancy && section === "MINE" ? (
        <FloatingActions>
          <FloatingAction
            accessibilityLabel="Start a new chat"
            icon={MessageCirclePlus}
            label="New chat"
            onPress={() => setPickerOpen(true)}
          />
        </FloatingActions>
      ) : null}

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
      {selection.dialog}
    </View>
  );
}

