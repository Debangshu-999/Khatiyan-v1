import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CalendarDays, Megaphone, Pencil, Plus, Save, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/auth/auth-ui";
import { AttachmentSection, useNoticeAttachments } from "@/features/notice/notice-attachments";
import { ActionButton, BackButton, ChoiceButton, FormInput, IconButton } from "@/features/owner/owner-ui";
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

  async function save() {
    if (!notice) {
      return;
    }
    if (!title.trim() || !body.trim()) {
      toast.show("Give the notice both a title and a body.", "error");
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
      toast.show(errorMessage(error), "error");
      void noticeQuery.refetch();
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: spacing.md }}>
      {unsaved.dialog}
      {/* Centred title with the back control pinned left. The spacer keeps the
          title optically centred without measuring the button. */}
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, }}>
          Notice Details
        </Text>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          {/* No chip in the empty case. The missing pencil already says the
              notice is closed, and "View only" reads as a permissions verdict —
              which it is not, since the same person could edit it an hour
              earlier. */}
          {notice && editable ? (
            <IconButton
              accessibilityLabel={editing ? "Leave edit mode" : "Edit this notice"}
              icon={editing ? X : Pencil}
              onPress={() => (editing ? leaveEditMode() : setEditRequested(true))}
            />
          ) : null}
        </View>
      </View>

      {noticeQuery.isLoading ? <NoticeDetailSkeleton /> : null}

      {!noticeQuery.isLoading && !notice ? (
        <EmptyState
          description="This notice may have been deleted, or the link is out of date."
          eyebrow="Not found"
          icon={Megaphone}
          title="Notice unavailable"
        />
      ) : null}

      {notice ? (
        <Card>
          <View style={{ gap: spacing.md }}>
            {/* Title, with its icon chip */}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View
                style={{
                  alignItems: "center",
                  borderColor: colors.ink,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  borderWidth: 1,
                  height: 44,
                  justifyContent: "center",
                  width: 44,
                }}
              >
                <Megaphone color={colors.ink} size={21} strokeWidth={2.2} />
              </View>

              <View style={{ flex: 1, gap: spacing.sm }}>
                {field === "title" ? (
                  <FormInput label="Title" onChangeText={setTitle} placeholder="Notice title" value={title} />
                ) : (
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, lineHeight: 25 }}>
                    {title}
                  </Text>
                )}
              </View>

              {editing ? (
                <FieldPencil active={field === "title"} onPress={() => setField(field === "title" ? null : "title")} />
              ) : null}
            </View>

            {/* Above the rule: when it lands, and how loudly */}
            <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <CalendarDays color={colors.kicker} size={14} />
                <Text style={[type.caption, { color: colors.muted }]}>
                  {formatNoticeDate(notice.visibleFrom)}
                </Text>
              </View>

              <PriorityPill priority={priority} />

              {editing ? (
                <FieldPencil
                  active={field === "priority"}
                  onPress={() => setField(field === "priority" ? null : "priority")}
                />
              ) : null}
            </View>

            {field === "priority" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {PRIORITIES.map((option) => (
                  <ChoiceButton
                    active={priority === option}
                    key={option}
                    label={option.charAt(0) + option.slice(1).toLowerCase()}
                    onPress={() => setPriority(option)}
                  />
                ))}
              </View>
            ) : null}

            <View style={{ backgroundColor: colors.border, height: 1 }} />

            {/* Body */}
            <View style={{ gap: spacing.sm }}>
              {editing ? (
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>NOTICE</Text>
                  <FieldPencil active={field === "body"} onPress={() => setField(field === "body" ? null : "body")} />
                </View>
              ) : null}

              {field === "body" ? (
                <FormInput label="Body" multiline onChangeText={setBody} placeholder="Write the notice" value={body} />
              ) : (
                <Text style={[type.body, { color: colors.muted, lineHeight: 22 }]}>
                  {body}
                </Text>
              )}
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

            {editing ? (
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <ActionButton
                    disabled={updateState.isLoading}
                    icon={Save}
                    label={updateState.isLoading ? "Saving…" : "Save changes"}
                    onPress={save}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {attachments.overlays}
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

function PriorityPill({ priority }: { priority: NoticePriority }) {
  const { colors, type } = useTheme();
  const loud = priority === "URGENT" || priority === "EMERGENCY";

  return (
    <View
      style={{
        backgroundColor: loud ? colors.dangerSoft : colors.neutralSoft,
        borderRadius: 999,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <Text style={[type.caption, { color: loud ? colors.danger : colors.neutralText, fontWeight: "700" }]}>
        {priority}
      </Text>
    </View>
  );
}

function formatNoticeDate(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}`;
}
