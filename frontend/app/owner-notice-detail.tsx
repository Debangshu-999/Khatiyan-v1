import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { PickerOptionRow } from "@/components/picker-option-row";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarDays, Clock3, Megaphone, Paperclip, Pencil, Save, Users, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { AttachmentSection, useNoticeAttachments } from "@/features/notice/notice-attachments";
import { Fact, FactRow, LaneBadge, PriorityFact, noticeLane, priorityLabel } from "@/features/notice/notice-ui";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import {
  canEditNotice,
  type NoticePriority,
  useGetNoticeQuery,
  useUpdateNoticeMutation,
} from "@/store/services/notice-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const PRIORITIES: NoticePriority[] = ["NORMAL", "IMPORTANT", "URGENT", "EMERGENCY"];

/**
 * Notice detail.
 *
 * <p>One screen, two modes. View mode collapses attachments into a single row
 * per kind ("+2 documents") because a reader wants the notice, not its file
 * list. Edit mode expands them to one row each with a remove control, because
 * an editor is working on the files themselves.
 *
 * <p>Attachments persist. They are rows in {@code notice_attachments} (V6073),
 * uploaded to storage on pick and saved immediately — which is why leaving edit
 * mode discards only the text fields and never the files.
 */
export default function OwnerNoticeDetailScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();

  // `edit=1` opens straight in edit mode — the Edit buttons on the notice lists
  // route here rather than opening a sheet of their own, so they need to land
  // where that sheet used to.
  const { edit, noticeId } = useLocalSearchParams<{ edit?: string; noticeId?: string }>();
  const noticeQuery = useGetNoticeQuery(noticeId ?? "", { skip: !noticeId });
  const notice = noticeQuery.data;
  const serverAttachments = notice?.attachments;

  const { canManage: canManageResource } = usePropertyPermissions(notice?.propertyId);
  const canManageNotices = canManageResource("NOTICES");
  // Permission to manage notices on this property says nothing about whether
  // THIS one is still open to change. Offering Edit on a closed notice invited
  // a save the server would refuse — while attachment changes, which save on
  // pick, went through regardless.
  const editable = canManageNotices && canEditNotice(notice);

  const [updateNotice, updateState] = useUpdateNoticeMutation();

  // `edit=1` opens straight in edit mode, and that param arrives before the
  // notice does — so the request is held separately and only becomes edit mode
  // once the notice is known to be editable. Otherwise a link to an archived
  // notice would open its form while the toggle that leaves it stays hidden.
  const [editRequested, setEditRequested] = useState(edit === "1");
  const editing = editRequested && editable;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<NoticePriority>("NORMAL");
  const attachments = useNoticeAttachments(undefined, noticeId ?? null);

  // Which field's inline editor is open. Only one at a time — a screen with
  // three inputs live at once stops reading as a notice.
  const [field, setField] = useState<"title" | "body" | "priority" | null>(null);

  // Seed the editors once per notice, keyed on its id rather than on the object
  // — a background refetch returns a new object for the same notice, and
  // re-seeding on that would wipe whatever someone is typing. Keying on the id
  // also means arriving with `edit=1` still gets its values, which a guard on
  // `editing` would have skipped.
  const [seededNoticeId, setSeededNoticeId] = useState<string | null>(null);

  useEffect(() => {
    if (!notice || notice.id === seededNoticeId) {
      return;
    }
    setTitle(notice.title);
    setBody(notice.body);
    setPriority(notice.priority);
    setSeededNoticeId(notice.id);
  }, [notice, seededNoticeId]);

  // Seeded separately from the text fields: those are seeded once so an edit in
  // progress is not overwritten, but attachments have no draft state — every
  // change is already saved — so they follow the server's copy exactly.
  useEffect(() => {
    if (!serverAttachments) {
      return;
    }
    attachments.reset(
      serverAttachments.map((attachment) => ({
        contentType: attachment.contentType,
        id: attachment.id,
        kind: attachment.kind === "IMAGE" ? ("image" as const) : ("document" as const),
        name: attachment.fileName,
        persisted: true,
        publicId: attachment.publicId,
        sizeBytes: attachment.sizeBytes,
        uri: attachment.url,
      })),
    );
    // `attachments` is recreated each render; keying on the server data is what
    // makes this run only when that data actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAttachments]);

  // Only the text fields count. Attachments save the moment they are picked, so
  // leaving with one attached loses nothing.
  const dirty = Boolean(
    editing &&
      notice &&
      (title !== notice.title || body !== notice.body || priority !== notice.priority),
  );
  const unsaved = useUnsavedChanges(dirty);

  function leaveEditMode() {
    // Leaving edit mode discards the edits, so it is challenged like an exit.
    unsaved.guard(() => {
      setField(null);
      setEditRequested(false);
      if (notice) {
        setTitle(notice.title);
        setBody(notice.body);
        setPriority(notice.priority);
      }
    });
  }

  const form = useFormErrors<"title" | "body">();
  async function save() {
    if (!notice) {
      return;
    }

    // Saving an untouched notice would fire a request and drop out of edit
    // mode, reporting success for a change nobody made.
    if (!dirty) {
      toast.warning("No changes have been made.");
      return;
    }

    if (!title.trim() || !body.trim()) {
      form.validate({
        ...(title.trim() ? {} : { title: "Give the notice a title." }),
        ...(body.trim() ? {} : { body: "Give the notice a body." }),
      });
      return;
    }

    try {
      await updateNotice({
        noticeId: notice.id,
        payload: {
          body: body.trim(),
          priority,
          title: title.trim(),
          visibleFrom: notice.visibleFrom,
          visibleUntil: notice.visibleUntil,
        },
      }).unwrap();

      unsaved.markSaved();
      setField(null);
      setEditRequested(false);
      toast.show("Notice saved.", "success");
    } catch (error) {
      // Surface the backend's own words. The one that matters here is the
      // go-live guard — "already live and can no longer be edited" tells the
      // person exactly why, where a generic retry message would invite them to
      // try again forever.
      form.failFromServer(errorMessage(error));
      void noticeQuery.refetch();
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: spacing.md }}>
      {unsaved.dialog}
      {/* No back control, so no row to centre the title against — it simply
          leads the screen, the way every other header in the app does. */}
      <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22 }}>
        Notice details
      </Text>

      {noticeQuery.isLoading ? <NoticeDetailSkeleton /> : null}

      {!noticeQuery.isLoading && !notice ? (
        <EmptyState
          description="This notice may have been deleted, or the link is out of date."
          icon={Megaphone}
          title="Notice unavailable"
        />
      ) : null}

      {notice ? (
        <>
          {/* What this notice IS: its state, who it went to, and when. The
              wording lives in the message card below rather than being
              previewed here as well — one body of text printed twice on one
              screen says nothing the second time. */}
          <Card>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <LaneBadge lane={noticeLane(notice)} />
              <View style={{ flex: 1 }} />
              {/* On the card, not in the header bar: it acts on this notice, so
                  it belongs beside it. Borderless — an outlined button next to
                  the tinted lane badge made two boxed objects on one line, and
                  the pencil already says this is a control. */}
              {editable ? (
                <EditToggle editing={editing} onPress={() => (editing ? leaveEditMode() : setEditRequested(true))} />
              ) : null}
            </View>

            <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                {field === "title" ? (
                  <FormInput
                    error={form.errors.title}
                    label="Title"
                    onChangeText={setTitle}
                    placeholder="Notice title"
                    value={title}
                  />
                ) : (
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 26 }}>
                    {title}
                  </Text>
                )}
              </View>
              {editing ? (
                <FieldPencil active={field === "title"} onPress={() => setField(field === "title" ? null : "title")} />
              ) : null}
            </View>

            {/* Tinted blocks with white between them, not hairline rules. Three
                rules across one card drew more lines than facts, and the eye
                counted the dividers before it read anything. A shade off the
                card plus a gap separates them without adding a mark. */}
            <View style={{ gap: 5 }}>
              <FactBlock>
                <FactRow
                  left={{ icon: Users, text: "For all tenants" }}
                  right={{ icon: CalendarDays, text: formatNoticeDate(notice.visibleFrom) }}
                />
              </FactBlock>

              {/* Date and time as separate fields, not "12 Sept 2026, 06:00 PM"
                  in one. An owner checking a notice is checking one or the
                  other — which day it lands, or what time — and a single run of
                  text makes both of them read the whole string. */}
              <FactBlock>
                <FactRow
                  left={{ icon: Clock3, text: formatNoticeTime(notice.visibleFrom) }}
                  right={
                    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <PriorityFact priority={priority} />
                      </View>
                      {/* On the field it changes, not on a heading above the
                          card. A pencil sitting apart from its value is a
                          control with no subject. */}
                      {editing ? (
                        <FieldPencil active={field === "priority"} onPress={() => setField("priority")} />
                      ) : null}
                    </View>
                  }
                />
              </FactBlock>

              {/* When it stops, split the same way the start is. An owner
                  checking a notice is as likely to be asking when it comes down
                  as when it went up, and "no end date" is itself the answer
                  worth seeing — it is the setting people forget. */}
              {/* One fact across the whole row, not a half-width pair. "Until 05
                  Sept 2026" alone overran half a phone's card width and
                  ellipsised the year away — which is the half of a date that
                  matters least right up until it does. */}
              <FactBlock>
                <FactRow
                  left={{
                    icon: CalendarDays,
                    text: notice.visibleUntil
                      ? `Until ${formatNoticeDate(notice.visibleUntil)} · ${formatNoticeTime(notice.visibleUntil)}`
                      : "No end date",
                  }}
                />
              </FactBlock>

              {/* Both, always. Publishing a notice raises NoticePublishedEvent,
                  which the notification module turns into a feed row for every
                  tenant and hands to the push pipeline — there is no
                  in-app-only notice to distinguish this from. */}
              <FactBlock>
                <Fact fact={{ icon: Megaphone, text: "In-app + push notification" }} />
              </FactBlock>
            </View>
          </Card>

          <Card>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>
                Notice message
              </Text>
              {editing ? (
                <FieldPencil active={field === "body"} onPress={() => setField(field === "body" ? null : "body")} />
              ) : null}
            </View>

            {field === "body" ? (
              <FormInput
                error={form.errors.body}
                label="Body"
                multiline
                onChangeText={setBody}
                placeholder="Write the notice"
                value={body}
              />
            ) : (
              <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
                {body}
              </Text>
            )}
          </Card>

          {/* Its own card, and only when there is something in it or something
              to add. AttachmentSection returns null when a read-only notice has
              no files, which would otherwise leave an empty titled card. */}
          {attachments.items.length > 0 || editing ? (
            <Card>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <Paperclip color={colors.kicker} size={15} strokeWidth={2.2} />
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16 }}>Attachments</Text>
              </View>
              <AttachmentSection
                documents={attachments.documents}
                editing={editing}
                images={attachments.images}
                items={attachments.items}
                onAdd={editing ? attachments.openChooser : undefined}
                onOpenDocuments={attachments.openDocuments}
                onOpenSlideshow={attachments.openSlideshow}
                onRemove={attachments.remove}
                progress={attachments.progress}
                uploading={attachments.uploading}
              />
            </Card>
          ) : null}

          {editing ? (
            <ActionButton
              disabled={updateState.isLoading}
              icon={Save}
              label={updateState.isLoading ? "Saving…" : "Save changes"}
              onPress={save}
            />
          ) : null}
        </>
      ) : null}

      {field === "priority" ? (
        <PriorityPickerModal
          onClose={() => setField(null)}
          onSelect={(next) => {
            setPriority(next);
            setField(null);
          }}
          value={priority}
        />
      ) : null}

      {attachments.overlays}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

/**
 * Stands in for the notice card itself, not for a generic card.
 *
 * <p>A single small placeholder left most of the screen blank, which reads as a
 * page that failed to load rather than one still loading. This mirrors the real
 * layout — icon chip, title, meta row, rule, body — so the content lands in the
 * shape the eye is already holding.
 */
function NoticeDetailSkeleton() {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Skeleton height={44} radius={14} width={44} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={18} width="90%" />
            <Skeleton height={18} width="55%" />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Skeleton height={13} width={130} />
          <Skeleton height={13} radius={999} width={70} />
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="97%" />
          <Skeleton height={14} width="92%" />
          <Skeleton height={14} width="60%" />
        </View>
      </View>
    </Card>
  );
}

function FieldPencil({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={active ? "Done editing this field" : "Edit this field"}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : "transparent",
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        height: 30,
        justifyContent: "center",
        width: 30,
      }}
    >
      <Pencil color={colors.primary} size={15} strokeWidth={2.2} />
    </Pressable>
  );
}

/** One tinted row inside a card — this screen's alternative to a divider. */
function FactBlock({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderCurve: "continuous",
        borderRadius: 8,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Picking the priority — the app's shared picker, same as gender.
 *
 * <p>
 * {@code PickerOptionRow} in a centred card, not chips. Chips unfolding inside
 * the card pushed everything below them down the moment the pencil was tapped,
 * so the row being edited moved out from under the thumb that had just tapped
 * it. Using the picker every other single-choice field uses also means this one
 * cannot drift away from them.
 */
function PriorityPickerModal({
  onClose,
  onSelect,
  value,
}: {
  onClose: () => void;
  onSelect: (value: NoticePriority) => void;
  value: NoticePriority;
}) {
  const { colors, fonts } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Tapping the scrim closes it. A centred dialog with no visible dismiss
          needs one, and a four-option choice does not deserve a Cancel button
          taking up a fifth row. */}
      <AnimatedPressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        {/* Its own pressable so a tap on the card does not reach the scrim
            behind it and close the picker mid-decision. */}
        <AnimatedPressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderCurve: "continuous",
            borderRadius: 14,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.display,
              fontSize: 19,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            Select priority
          </Text>

          {/* The same row every other picker in the app uses. Its hairline runs
              above each option INCLUDING the first, which is what separates the
              list from the heading above it. */}
          <View style={{ paddingHorizontal: spacing.lg }}>
            {PRIORITIES.map((option) => (
              <PickerOptionRow
                key={option}
                label={priorityLabel(option)}
                onPress={() => onSelect(option)}
                selected={option === value}
              />
            ))}
          </View>
        </AnimatedPressable>
      </AnimatedPressable>
    </Modal>
  );
}

/**
 * Enter or leave edit mode.
 *
 * <p>
 * Not an {@code ActionButton}. Every variant of that draws a border or a fill,
 * and this sits on the same line as the lane badge, where a second bounded
 * object competes with the status it is meant to sit quietly beside.
 */
function EditToggle({ editing, onPress }: { editing: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  const Icon = editing ? X : Pencil;

  return (
    <AnimatedPressable
      accessibilityLabel={editing ? "Leave edit mode" : "Edit this notice"}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 2 }}
    >
      <Icon color={colors.primary} size={16} strokeWidth={2.3} />
      <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 14 }}>
        {editing ? "Cancel" : "Edit"}
      </Text>
    </AnimatedPressable>
  );
}

function formatNoticeDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  });
}

function formatNoticeTime(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
