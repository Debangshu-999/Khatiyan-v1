import { useState } from "react";
import { Dimensions, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { DOCUMENT_UPLOAD } from "@/features/uploads/upload-limits";
import { uploadAssets } from "@/features/uploads/upload-asset";
import {
  useAddNoticeAttachmentsMutation,
  useRemoveNoticeAttachmentMutation,
  type NoticeAttachment,
} from "@/store/services/notice-api";
import * as ImagePicker from "expo-image-picker";
import { ChevronRight, FileText, Image as ImageIcon, Plus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { AlertModal } from "@/components/alert-modal";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type AttachmentKind = "document" | "image";

/** Images and documents together, matching NoticeAttachment.MAX_PER_NOTICE. */
export const MAX_ATTACHMENTS = 10;

/** What a picker hands over, before anything has been uploaded. */
type PickedNoticeFile = {
  kind: AttachmentKind;
  mimeType?: string | null;
  name: string;
  size?: number | null;
  uri: string;
};

export type Attachment = {
  /** Server row id once attached; the storage handle before that. */
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Remote URL — the thumbnail and the preview both read it. */
  uri: string;
  publicId: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  /** False while it exists only in this screen's state, before the notice does. */
  persisted: boolean;
};

/**
 * Attachment picking, listing and previewing, shared by the notice detail and
 * create screens so the two cannot drift.
 *
 * <p>Files upload as they are picked, never at submit — ten photos inside the
 * publish request would put the bytes in the request body and time it out on a
 * slow connection. What happens next depends on whether the notice exists yet:
 * on the detail screen the upload is followed by an attach call, so it is saved
 * immediately; on the create screen it is held until publish carries the handles
 * with it. Abandoning either leaks the stored file, which the orphan sweep
 * reclaims.
 *
 * <p>View mode collapses attachments to one row per kind ("+2 documents")
 * because a reader wants the notice, not its file list. Edit mode expands them
 * to one row each with a remove control, because an editor is working on the
 * files themselves.
 */
/** A saved row, in the shape this screen works with. */
function fromServer(attachment: NoticeAttachment): Attachment {
  return {
    contentType: attachment.contentType,
    id: attachment.id,
    kind: attachment.kind === "IMAGE" ? "image" : "document",
    name: attachment.fileName,
    persisted: true,
    publicId: attachment.publicId,
    sizeBytes: attachment.sizeBytes,
    uri: attachment.url,
  };
}

export function useNoticeAttachments(
  onChanged?: () => void,
  /** Given once the notice exists, so changes save straight away. */
  noticeId?: string | null,
) {
  const toast = useToast();
  // Attachment failures happen mid-operation, so they get a modal.
  const opErrors = useFormErrors<never>();
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [addAttachments] = useAddNoticeAttachmentsMutation();
  const [removeAttachment] = useRemoveNoticeAttachmentMutation();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<Attachment | null>(null);
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null);

  const documents = items.filter((item) => item.kind === "document");
  const images = items.filter((item) => item.kind === "image");

  /** Replaces the list wholesale — used to seed from a notice already saved. */
  function reset(next: Attachment[]) {
    setItems(next);
  }

  /**
   * Uploads the picked files, then attaches them if the notice exists.
   *
   * <p>Images and documents go to different storage targets: documents must not
   * be treated as images, or Cloudinary tries to transform a PDF.
   */
  async function add(picked: PickedNoticeFile[]) {
    const remaining = MAX_ATTACHMENTS - items.length;
    const accepted = picked.slice(0, remaining);
    if (accepted.length === 0) {
      opErrors.failFromServer(`A notice can have at most ${MAX_ATTACHMENTS} attachments.`);
      return;
    }

    try {
      setUploading(true);
      const uploaded: Attachment[] = [];
      for (const [index, file] of accepted.entries()) {
        setProgress({ completed: index, total: accepted.length });
        const [asset] = await uploadAssets(
          [{ mimeType: file.mimeType, name: file.name, size: file.size, uri: file.uri }],
          file.kind === "image" ? "NOTICE_IMAGE" : "NOTICE_DOCUMENT",
        );
        uploaded.push({
          contentType: file.mimeType ?? null,
          id: asset.publicId,
          kind: file.kind,
          name: file.name,
          persisted: false,
          publicId: asset.publicId,
          sizeBytes: file.size ?? null,
          uri: asset.url,
        });
      }
      setProgress({ completed: accepted.length, total: accepted.length });

      if (noticeId) {
        const saved = await addAttachments({
          attachments: uploaded.map((item) => ({
            contentType: item.contentType,
            fileName: item.name,
            kind: item.kind === "image" ? "IMAGE" : "DOCUMENT",
            publicId: item.publicId,
            sizeBytes: item.sizeBytes,
            url: item.uri,
          })),
          noticeId,
        }).unwrap();
        setItems(saved.map(fromServer));
      } else {
        setItems((current) => [...current, ...uploaded]);
      }
      onChanged?.();
    } catch (error) {
      console.error("Notice attachment upload failed:", error);
      toast.show(
        error instanceof Error && error.message ? error.message : "Could not attach the file. Try again.",
        "error",
      );
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function remove(id: string) {
    const target = items.find((item) => item.id === id);
    if (target?.persisted && noticeId) {
      try {
        const saved = await removeAttachment({ attachmentId: id, noticeId }).unwrap();
        setItems(saved.map(fromServer));
        onChanged?.();
      } catch (error) {
        console.error("Notice attachment removal failed:", error);
        opErrors.failFromServer("Could not remove the attachment.");
      }
      return;
    }
    // Not saved yet: it only exists here, so dropping it is enough. The stored
    // file becomes an orphan for the sweep.
    setItems((current) => current.filter((item) => item.id !== id));
    onChanged?.();
  }

  async function pickImages() {
    setChooserOpen(false);

    // The library needs permission; ask before launching so a refusal is an
    // explained toast rather than a picker that silently never opens.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      opErrors.failFromServer("Allow photo library access to attach images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.75,
    });

    if (result.canceled) {
      return;
    }

    await add(
      result.assets.map((asset, index) => ({
        kind: "image" as const,
        mimeType: asset.mimeType,
        name: asset.fileName ?? `image-${index + 1}.jpg`,
        size: asset.fileSize,
        uri: asset.uri,
      })),
    );
  }

  // Documents come from the system file provider, which handles its own access —
  // there is no permission to request up front.
  async function pickDocuments() {
    setChooserOpen(false);

    // Filtered to what the server will actually accept. "*/*" let people pick a
    // zip and only learn it was rejected after the upload had run.
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: [...DOCUMENT_UPLOAD.mimeTypes],
    });

    if (result.canceled) {
      return;
    }

    await add(
      result.assets.map((asset, index) => ({
        kind: "document" as const,
        mimeType: asset.mimeType,
        name: asset.name || `document-${index + 1}`,
        size: asset.size,
        uri: asset.uri,
      })),
    );
  }

  const overlays = (
    <>
      {chooserOpen ? (
        <AttachChoiceSheet
          onClose={() => setChooserOpen(false)}
          onPickDocuments={pickDocuments}
          onPickImages={pickImages}
        />
      ) : null}

      {documentPreview ? (
        <DocumentPreviewModal
          attachment={documentPreview}
          documents={documents}
          onClose={() => setDocumentPreview(null)}
          onSelect={setDocumentPreview}
        />
      ) : null}

      {slideshowIndex !== null && images.length > 0 ? (
        <ImageSlideshowModal images={images} onClose={() => setSlideshowIndex(null)} startIndex={slideshowIndex} />
      ) : null}
    </>
  );

  return {
    documents,
    images,
    items,
    openChooser: () => setChooserOpen(true),
    openDocuments: () => setDocumentPreview(documents[0] ?? null),
    openSlideshow: () => setSlideshowIndex(0),
    overlays,
    /** Batch upload position, for the progress line. */
    progress,
    remove,
    /** Seeds the list from a notice already saved. */
    reset,
    setItems,
    /** True while files are going to storage; disables the attach control. */
    uploading,
  };
}

/** The attachments block itself. `editing` decides grouped vs. per-file rows. */
export function AttachmentSection({
  documents,
  editing,
  emptyHint,
  images,
  items,
  onAdd,
  onOpenDocuments,
  onOpenSlideshow,
  onRemove,
  progress,
  tip,
  uploading,
}: {
  documents: Attachment[];
  editing: boolean;
  emptyHint?: string;
  images: Attachment[];
  items: Attachment[];
  /** Given in edit mode: renders the full-width add area. */
  onAdd?: () => void;
  onOpenDocuments: () => void;
  onOpenSlideshow: () => void;
  onRemove: (id: string) => void;
  progress?: { completed: number; total: number } | null;
  /** Advice under the files — the recurring-notice caveat uses this. */
  tip?: string;
  uploading?: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  // Hidden entirely in read-only mode when there are none — an empty section on
  // a notice that cannot yet carry files is a promise the app does not keep.
  if (items.length === 0 && !editing) {
    return null;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {/* The add control spans the section rather than sitting as one tile among
          the files: it is the section's only action, and a 104px square lost in
          a wrap of thumbnails reads as another attachment. */}
      {onAdd ? (
        <AnimatedPressable
          accessibilityLabel="Add an attachment"
          accessibilityRole="button"
          disabled={uploading}
          onPress={onAdd}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderCurve: "continuous",
            borderRadius: 14,
            borderStyle: "dashed",
            borderWidth: 1,
            gap: 4,
            justifyContent: "center",
            opacity: uploading ? 0.5 : 1,
            paddingVertical: spacing.lg,
            width: "100%",
          }}
        >
          <Plus color={colors.kicker} size={20} strokeWidth={2.2} />
          <Text style={[type.caption, { color: colors.kicker }]}>Add image or file</Text>
        </AnimatedPressable>
      ) : null}

      {progress ? (
        <View style={{ gap: 6 }}>
          <Text style={[type.caption, { color: colors.ink, fontFamily: fonts.sansBold }]}>
            Uploading {Math.min(progress.completed + 1, progress.total)} of {progress.total}…
          </Text>
          <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, height: 4, overflow: "hidden" }}>
            <View
              style={{
                backgroundColor: colors.ink,
                height: 4,
                width: `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%`,
              }}
            />
          </View>
        </View>
      ) : null}

      {items.length === 0 ? (
        <Text style={[type.caption, { color: colors.muted }]}>
          {emptyHint ?? "Nothing attached yet."}
        </Text>
      ) : editing ? (
        <View style={{ gap: spacing.xs }}>
          {items.map((item) => (
            <AttachmentRow attachment={item} key={item.id} onRemove={() => onRemove(item.id)} />
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          {images.length > 0 ? (
            <AttachmentGroupRow
              count={images.length}
              kind="image"
              onPress={onOpenSlideshow}
            />
          ) : null}
          {documents.length > 0 ? (
            <AttachmentGroupRow
              count={documents.length}
              kind="document"
              onPress={onOpenDocuments}
            />
          ) : null}
        </View>
      )}

      {tip ? (
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderCurve: "continuous",
            borderRadius: 12,
            padding: spacing.sm,
          }}
        >
          <Text style={[type.caption, { color: colors.inkSoft, lineHeight: 18 }]}>{tip}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The collapsed read-only row: "3 images ›".
 *
 * <p>View mode groups by kind because a reader wants the notice, not its file
 * list; tapping opens the slideshow or the document viewer.
 */
function AttachmentGroupRow({
  count,
  kind,
  onPress,
}: {
  count: number;
  kind: AttachmentKind;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  const noun = kind === "image" ? "image" : "document";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {kind === "image" ? (
        <ImageIcon color={colors.primary} size={17} />
      ) : (
        <FileText color={colors.primary} size={17} />
      )}
      <Text style={[type.body, { color: colors.ink, flex: 1 }]}>
        {count} {noun}
        {count === 1 ? "" : "s"}
      </Text>
      <ChevronRight color={colors.muted} size={17} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Images or documents — asked before the picker opens, since they differ. */
function AttachChoiceSheet({
  onClose,
  onPickDocuments,
  onPickImages,
}: {
  onClose: () => void;
  onPickDocuments: () => void;
  onPickImages: () => void;
}) {
  return (
    <SheetShell onClose={onClose} title="Attach to this notice">
      <View style={{ gap: spacing.sm }}>
        <ActionButton icon={ImageIcon} label="Photos" onPress={onPickImages} variant="secondary" />
        <ActionButton icon={FileText} label="Documents" onPress={onPickDocuments} variant="secondary" />
      </View>
    </SheetShell>
  );
}

function AttachmentRow({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {attachment.kind === "image" ? (
        <Image source={{ uri: attachment.uri }} style={{ borderRadius: 6, height: 28, width: 28 }} />
      ) : (
        <FileText color={colors.primary} size={17} />
      )}
      <Text numberOfLines={1} style={[type.body, { color: colors.ink, flex: 1 }]}>
        {attachment.name}
      </Text>
      <Pressable accessibilityLabel={`Remove ${attachment.name}`} accessibilityRole="button" hitSlop={8} onPress={onRemove}>
        <X color={colors.danger} size={17} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function DocumentPreviewModal({
  attachment,
  documents,
  onClose,
  onSelect,
}: {
  attachment: Attachment;
  documents: Attachment[];
  onClose: () => void;
  onSelect: (attachment: Attachment) => void;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            maxHeight: "90%",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              justifyContent: "space-between",
              marginBottom: spacing.md,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20, }}
            >
              {attachment.name}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceSunken,
                borderRadius: 14,
                gap: spacing.sm,
                justifyContent: "center",
                paddingVertical: spacing.xxl,
              }}
            >
              <FileText color={colors.muted} size={40} strokeWidth={1.6} />
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>NO PREVIEW YET</Text>
            </View>

            {documents.length > 1 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={[type.caption, { color: colors.kicker, fontWeight: "700" }]}>ALL DOCUMENTS</Text>
                {documents.map((document) => (
                  <Pressable
                    accessibilityRole="button"
                    key={document.id}
                    onPress={() => onSelect(document)}
                    style={{
                      alignItems: "center",
                      backgroundColor: document.id === attachment.id ? colors.primarySoft : "transparent",
                      borderColor: document.id === attachment.id ? colors.primary : colors.border,
                      borderRadius: 10,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: spacing.sm,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <FileText color={colors.primary} size={16} />
                    <Text numberOfLines={1} style={[type.body, { color: colors.ink, flex: 1 }]}>
                      {document.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
}

function ImageSlideshowModal({
  images,
  onClose,
  startIndex,
}: {
  images: Attachment[];
  onClose: () => void;
  startIndex: number;
}) {
  const { type } = useTheme();
  const [index, setIndex] = useState(startIndex);
  const width = Dimensions.get("window").width;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: "rgba(8, 12, 20, 0.94)", flex: 1 }}>
        <SafeAreaView edges={["top"]} />

        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <Text style={[type.caption, { color: "#E2E8F0", fontWeight: "700" }]}>
            {index + 1} / {images.length}
          </Text>
          <Pressable accessibilityLabel="Close slideshow" accessibilityRole="button" hitSlop={10} onPress={onClose}>
            <X color="#E2E8F0" size={22} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          contentOffset={{ x: startIndex * width, y: 0 }}
          horizontal
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {images.map((image) => (
            <View key={image.id} style={{ alignItems: "center", justifyContent: "center", padding: spacing.lg, width }}>
              <Image
                resizeMode="contain"
                source={{ uri: image.uri }}
                style={{ borderRadius: 14, height: "100%", width: "100%" }}
              />
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: spacing.xs,
            justifyContent: "center",
            paddingBottom: spacing.lg,
          }}
        >
          {images.map((image, position) => (
            <View
              key={image.id}
              style={{
                backgroundColor: position === index ? "#F8FAFC" : "rgba(248, 250, 252, 0.35)",
                borderRadius: 999,
                height: 6,
                width: position === index ? 18 : 6,
              }}
            />
          ))}
        </View>

        <SafeAreaView edges={["bottom"]} />
      </View>
    </Modal>
  );
}
