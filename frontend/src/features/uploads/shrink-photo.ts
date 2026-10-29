import { Platform } from "react-native";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { PHOTO_UPLOAD } from "@/features/uploads/upload-limits";
import type { PickedAsset } from "@/features/uploads/upload-asset";

/**
 * Smaller and smaller, until it fits. A 12 MP camera photo at 1600 px and 0.7
 * is usually 250 to 450 KB; the later steps catch a busy scene that is not.
 */
const STEPS = [
  { compress: 0.7, edge: 1600 },
  { compress: 0.6, edge: 1280 },
  { compress: 0.5, edge: 1024 },
  { compress: 0.45, edge: 800 },
] as const;

async function sizeOf(uri: string): Promise<number | null> {
  try {
    if (Platform.OS === "web") {
      return (await (await fetch(uri)).blob()).size;
    }
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/** Whether a picked file is a photo, by its type or its name. */
export function isPhoto(asset: PickedAsset): boolean {
  if (asset.mimeType?.startsWith("image/")) return true;
  const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
  return (PHOTO_UPLOAD.extensions as readonly string[]).includes(extension);
}

/**
 * Brings a photo under the 500 KB every photo target takes (user, 2026-10-28:
 * "we should not be storing such large photos").
 *
 * <p>Resized on its longest side and saved as JPEG, step by step, until it is
 * small enough. A photo already under the limit is sent as it is. One that is
 * still too large after the last step goes on to the size check, which
 * refuses it with its own message: nothing is uploaded over the limit.
 */
export async function shrinkPhoto(asset: PickedAsset): Promise<PickedAsset> {
  if (!asset.uri) return asset;
  const known = asset.size ?? (await sizeOf(asset.uri));
  if (known != null && known <= PHOTO_UPLOAD.maxBytes) return asset;

  const original = await ImageManipulator.manipulate(asset.uri).renderAsync();
  const landscape = original.width >= original.height;
  const longest = Math.max(original.width, original.height);
  const base = asset.name.replace(/\.[^.]+$/, "") || "photo";

  let last = asset;
  for (const step of STEPS) {
    const edge = Math.min(step.edge, longest);
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(landscape ? { width: edge } : { height: edge });
    const image = await (context.renderAsync());
    const saved = await image.saveAsync({ compress: step.compress, format: SaveFormat.JPEG });
    const size = await sizeOf(saved.uri);
    last = { mimeType: "image/jpeg", name: `${base}.jpg`, size, uri: saved.uri };
    if (size != null && size <= PHOTO_UPLOAD.maxBytes) return last;
  }
  return last;
}
