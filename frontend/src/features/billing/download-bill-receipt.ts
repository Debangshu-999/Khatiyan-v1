import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { normalizeApiBaseUrl } from "@/config/api";

/**
 * Downloads a bill's receipt PDF.
 *
 * <p>
 * <b>The PDF is made on the server.</b> It used to be an HTML string built here
 * and handed to expo-print, whose web module is a bare {@code window.print()}
 * that ignores the markup — a browser printed the billing screen rather than
 * the bill, and produced no file at all. The server now renders it, so this is
 * an ordinary file download exactly like the monthly CSV export, and the owner
 * and the tenant receive a byte-identical document.
 *
 * @returns the filename that was saved, for the confirmation message.
 */
export async function downloadBillReceipt({
  apiBaseUrl,
  billingCycleId,
  fileName,
  token,
}: {
  apiBaseUrl: string;
  billingCycleId: string;
  /** What the file is called once saved — the bill's reference code. */
  fileName: string;
  token: string | null;
}): Promise<string> {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const url = `${baseUrl}/api/v1/billing/cycles/${billingCycleId}/receipt.pdf`;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Receipt download failed (${response.status})`);
  }

  const safeName = `${fileName.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`;

  if (Platform.OS === "web" && typeof document !== "undefined") {
    // The anchor-and-blob trick the CSV export already uses. A real download,
    // not a print dialog.
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return safeName;
  }

  // Written to the cache under its proper name, then handed to the share sheet
  // — which is how a file reaches storage on Android without asking for
  // permissions the app has no other use for.
  const target = new File(Paths.cache, safeName);
  if (target.exists) {
    target.delete();
  }
  target.create();
  target.write(new Uint8Array(await response.arrayBuffer()));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target.uri, {
      UTI: "com.adobe.pdf",
      dialogTitle: safeName,
      mimeType: "application/pdf",
    });
  }
  return safeName;
}
