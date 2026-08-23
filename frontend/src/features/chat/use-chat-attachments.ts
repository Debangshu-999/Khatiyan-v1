import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { uploadAssets, type PickedAsset } from "@/features/uploads/upload-asset";
import { DOCUMENT_UPLOAD } from "@/features/uploads/upload-limits";
import type { ChatAttachmentDraft } from "@/store/services/chat-api";

/** Matches ChatMessage.MAX_ATTACHMENTS on the server. */
const MAX_PER_MESSAGE = 5;

/**
 * Picking and uploading what goes with a message.
 *
 * <p>The upload finishes BEFORE the message is sent, which is why this returns
 * drafts rather than sending them itself: a message row that referenced a
 * half-uploaded asset would render as a broken image for everyone, permanently.
 * The cost is an orphaned asset when somebody picks a photo and then abandons
 * the draft — chat will be the app's largest source of those, and there is still
 * no sweep to reclaim them.
 */
export function useChatAttachments() {
  const [uploading, setUploading] = useState(false);

  async function pickImages(): Promise<{ drafts: ChatAttachmentDraft[]; error?: string }> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { drafts: [], error: "Photo access is needed to send an image." };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.8,
      selectionLimit: MAX_PER_MESSAGE,
    });
    if (result.canceled || result.assets.length === 0) {
      return { drafts: [] };
    }

    return upload(
      result.assets.map((asset, at) => ({
        mimeType: asset.mimeType,
        name: asset.fileName ?? `Photo ${at + 1}`,
        size: asset.fileSize,
        uri: asset.uri,
      })),
      "IMAGE",
    );
  }

  async function pickFiles(): Promise<{ drafts: ChatAttachmentDraft[]; error?: string }> {
    // Filtered to what the server accepts, so nobody learns their zip was
    // refused only after the whole file has gone up.
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: [...DOCUMENT_UPLOAD.mimeTypes],
    });
    if (result.canceled || result.assets.length === 0) {
      return { drafts: [] };
    }

    return upload(
      result.assets.slice(0, MAX_PER_MESSAGE).map((asset) => ({
        mimeType: asset.mimeType,
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
      })),
      "FILE",
    );
  }

  async function upload(
    assets: PickedAsset[],
    kind: "IMAGE" | "FILE",
  ): Promise<{ drafts: ChatAttachmentDraft[]; error?: string }> {
    setUploading(true);
    try {
      const uploaded = await uploadAssets(assets, kind === "IMAGE" ? "CHAT_IMAGE" : "CHAT_FILE");
      return {
        drafts: uploaded.map((asset, at) => ({
          contentType: assets[at]?.mimeType ?? undefined,
          fileName: kind === "FILE" ? assets[at]?.name : undefined,
          kind,
          publicId: asset.publicId,
          sizeBytes: assets[at]?.size ?? undefined,
          url: asset.url,
        })),
      };
    } catch (failure) {
      return {
        drafts: [],
        error: failure instanceof Error ? failure.message : "That upload did not finish.",
      };
    } finally {
      setUploading(false);
    }
  }

  return { pickFiles, pickImages, uploading };
}
