import { Platform } from "react-native";

import { store } from "@/store/store";
import { normalizeApiBaseUrl } from "@/config/api";

/**
 * What every picker in the app produces, reduced to what an upload needs.
 * `expo-image-picker` and `expo-document-picker` name these fields differently,
 * so callers normalise once here rather than each remembering which is which.
 */
/**
 * An upload failure whose message was written for a person to read.
 *
 * <p>The point is telling OUR copy apart from an accident. Everything thrown
 * deliberately in this file names the file and says what to do; everything else
 * — a fetch that rejects, a JSON.parse over an HTML error page, a null
 * dereference — carries developer text that must never reach a modal. Callers
 * show the message only when it is one of these, so a new failure mode degrades
 * to a clean sentence instead of leaking "Unexpected token < in JSON".
 */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type PickedAsset = {
  name: string;
  /** Local device URI from the picker. */
  uri: string;
  /** e.g. "image/jpeg", "application/pdf". Falls back sensibly when absent. */
  mimeType?: string | null;
  /** Bytes, when the picker reports them. Checked against the target's ceiling. */
  size?: number | null;
};

export type UploadedAsset = {
  url: string;
  /** Cloudinary handle. Store it — without it the asset can never be deleted. */
  publicId: string;
};

/**
 * Where an upload is allowed to land. Must match the backend `UploadTarget`
 * enum; the server maps it to a folder so the client cannot choose one.
 */
export type UploadTarget =
  | "CONCERN_PHOTO"
  | "PAYMENT_PROOF"
  | "PROFILE_PHOTO"
  | "PROPERTY_IMAGE"
  | "ROOM_TYPE_IMAGE"
  | "LOCAL_PLACE_PHOTO"
  | "NOTICE_IMAGE"
  | "NOTICE_DOCUMENT"
  | "CHAT_IMAGE"
  | "CHAT_FILE";

type UploadSignature = {
  cloudName: string;
  apiKey: string;
  resourceType: string;
  folder: string;
  timestamp: number;
  signature: string;
  expiresInSeconds: number;
  /**
   * Comma-separated, signed. Sent back verbatim or the signature breaks.
   * Optional so a server that predates it still works during a rolling restart.
   */
  allowedFormats?: string;
  maxBytes?: number;
};

/**
 * Uploads one picked file and returns its stored URL and handle.
 *
 * <p>Bytes go straight from the device to Cloudinary — the backend only mints a
 * signature. Proxying them through Spring would put every photo through a
 * request thread for no benefit.
 *
 * <p>Throws on failure rather than returning a partial result: a caller that
 * saved a record with a missing image would be storing a lie, and the two live
 * bugs this replaces were both exactly that.
 */
export async function uploadAsset(asset: PickedAsset, target: UploadTarget): Promise<UploadedAsset> {
  const signature = await requestSignature(target);

  if (!asset.uri) {
    throw new UploadError(`"${asset.name}" has no file to upload.`);
  }

  // Checked here as well as at Cloudinary, because a rejected upload costs a
  // round trip of the whole file and returns a message written for developers.
  // Cloudinary is still the authority on format; there is no size parameter on
  // its upload API, so size is only ever checked here.
  // The picker does not always give a filename — the property screens fall back
  // to "Property image 1", which has no extension at all. Taking `.pop()` of
  // that returns the whole string and it gets read as the extension. The URI
  // keeps its real one, and the mime type is the last resort.
  const extension = fileExtension(asset);
  const allowed = signature.allowedFormats ? signature.allowedFormats.split(",").map((format) => format.trim()) : [];
  if (extension && allowed.length > 0 && !allowed.includes(extension)) {
    throw new UploadError(`"${asset.name}" is a .${extension} file. Allowed: ${allowed.join(", ")}.`);
  }
  const maxBytes = signature.maxBytes ?? 0;
  if (asset.size != null && maxBytes > 0 && asset.size > maxBytes) {
    throw new UploadError(
      `"${asset.name}" is ${formatBytes(asset.size)}. The limit is ${formatBytes(maxBytes)}.`,
    );
  }

  const form = new FormData();
  const mimeType = asset.mimeType ?? guessMimeType(asset.name);
  // A filename with an extension, always. Android hands back names with spaces
  // and no suffix, which nothing downstream can classify.
  const fileName = asset.name.includes(".") ? asset.name : `${asset.name}.${extension || "jpg"}`;

  // The two platforms take different file parts, and neither accepts the
  // other's — so this is chosen by platform, not attempted in sequence.
  //
  //  - Native: the {uri,name,type} descriptor. React Native's FormData cannot
  //    serialise a Blob; handed one it throws "Unsupported FormData part". An
  //    earlier version read the URI into a Blob first because that works on
  //    web, and `fetch("file://…")` succeeds on native too — so the Blob was
  //    taken every time and every native upload failed.
  //  - Web: a real Blob. Browsers reject the descriptor with the same message,
  //    and there is no file:// to read, so a failure here is terminal.
  if (Platform.OS === "web") {
    let blob: Blob;
    try {
      blob = await (await fetch(asset.uri)).blob();
    } catch {
      throw new UploadError(`Could not read "${asset.name}" from your device.`);
    }
    if (blob.size === 0) {
      throw new UploadError(`"${asset.name}" is empty.`);
    }
    form.append("file", blob, fileName);
  } else {
    // Every field a string, and `uri` present — Android's NetworkingModule
    // rejects any part with neither `string` nor `uri` as "Unsupported FormData
    // part", and that is the only shape it accepts for a file.
    form.append("file", {
      name: String(fileName),
      type: String(mimeType),
      uri: String(asset.uri),
    } as unknown as Blob);
  }
  // Every signed parameter must be sent back verbatim, and nothing unsigned may
  // be added, or Cloudinary rejects the upload.
  // Only when the server actually signed it. A server predating this field
  // returns undefined, and appending undefined throws "Unsupported FormData
  // part" on React Native — and would break the signature even if it did not,
  // since the server signed a string without this parameter in it.
  if (signature.allowedFormats) {
    form.append("allowed_formats", String(signature.allowedFormats));
  }
  form.append("api_key", String(signature.apiKey));
  form.append("folder", String(signature.folder));
  form.append("timestamp", String(signature.timestamp));
  form.append("signature", String(signature.signature));

  const endpoint = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType}/upload`;

  let status: number;
  let responseText: string;
  try {
    const result = await postMultipart(endpoint, form);
    status = result.status;
    responseText = result.text;
  } catch (networkError) {
    console.error("Upload request failed before sending", {
      asset: { mimeType: asset.mimeType, name: asset.name, size: asset.size, uriScheme: asset.uri.split(":")[0] },
      error: String(networkError),
      fileName,
      platform: Platform.OS,
      target,
    });
    throw new UploadError(`Could not upload "${asset.name}". Please try again.`);
  }

  if (status < 200 || status >= 300) {
    // Cloudinary's refusals name signatures, secrets and API internals. They go
    // to the log for us; the person sees something they can act on. Anything
    // they COULD act on — a bad format, an oversized file — was already caught
    // above, before the bytes were sent.
    console.error(`Cloudinary upload failed (${status}) for "${asset.name}": ${responseText}`);
    throw new UploadError(`Could not upload "${asset.name}". Please try again.`);
  }

  // Parsed defensively. A tunnel or proxy that returns an HTML interstitial
  // instead of Cloudinary's JSON used to surface here as "Unexpected token <
  // in JSON at position 0" — in a modal, to an owner.
  let body: { secure_url?: string; public_id?: string };
  try {
    body = JSON.parse(responseText) as { secure_url?: string; public_id?: string };
  } catch (parseError) {
    console.error(`Upload response was not JSON for "${asset.name}": ${responseText.slice(0, 200)}`, parseError);
    throw new UploadError(`Could not upload "${asset.name}". Please try again.`);
  }

  if (!body.secure_url || !body.public_id) {
    console.error(`Upload response carried no URL for "${asset.name}": ${responseText.slice(0, 200)}`);
    throw new UploadError(`Could not upload "${asset.name}". Please try again.`);
  }

  return { publicId: body.public_id, url: body.secure_url };
}

/**
 * Uploads several, preserving order. One failure fails the batch.
 *
 * <p>`onProgress` fires before each file starts and once more when the last one
 * finishes, so a caller can render "Uploading 3 of 10" without counting itself.
 * Sequential rather than parallel: ten concurrent uploads on a phone connection
 * finish no sooner and make progress meaningless.
 */
export async function uploadAssets(
  assets: PickedAsset[],
  target: UploadTarget,
  onProgress?: (completed: number, total: number) => void,
): Promise<UploadedAsset[]> {
  const uploaded: UploadedAsset[] = [];

  onProgress?.(0, assets.length);
  for (const asset of assets) {
    uploaded.push(await uploadAsset(asset, target));
    onProgress?.(uploaded.length, assets.length);
  }

  return uploaded;
}

/** The real extension: from the name, else the URI path, else the mime type. */
function fileExtension(asset: PickedAsset) {
  const fromName = asset.name.includes(".") ? asset.name.split(".").pop() : null;
  if (fromName) {
    return fromName.toLowerCase();
  }
  const path = asset.uri.split("?")[0];
  const fromUri = path.includes(".") ? path.split(".").pop() : null;
  if (fromUri && fromUri.length <= 5) {
    return fromUri.toLowerCase();
  }
  const subtype = asset.mimeType?.split("/")[1];
  return subtype ? subtype.toLowerCase() : "";
}

/** "8 MB", "512 KB" — for limit messages, so they read as a person would say them. */
function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * POSTs a multipart body, using each platform's native transport.
 *
 * <p>On native this is XMLHttpRequest, not `fetch`. React Native's `fetch` is
 * the whatwg-fetch polyfill layered over XHR, and it does not pass a React
 * Native FormData through untouched — the {uri,name,type} descriptor is a React
 * Native convention that the polyfill's web-standard body handling does not
 * recognise, so what reaches the native networking module is a part with
 * neither a `string` nor a `uri` and Android rejects it as "Unsupported
 * FormData part". XHR hands the FormData straight to the native module, which
 * is the path every React Native upload library takes.
 *
 * <p>On web `fetch` is the real thing and needs no help.
 */
function postMultipart(endpoint: string, form: FormData): Promise<{ status: number; text: string }> {
  if (Platform.OS === "web") {
    return fetch(endpoint, { body: form, method: "POST" }).then(async (response) => ({
      status: response.status,
      text: await response.text(),
    }));
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    // Deliberately no Content-Type header: the multipart boundary is generated
    // by the native layer, and setting it by hand discards that boundary.
    request.onload = () => resolve({ status: request.status, text: request.responseText ?? "" });
    request.onerror = () => reject(new Error("Network request failed"));
    request.ontimeout = () => reject(new Error("Upload timed out"));
    request.send(form);
  });
}

async function requestSignature(target: UploadTarget): Promise<UploadSignature> {
  const state = store.getState();
  const token = state.auth.accessToken;
  // Normalised here as well as at the source. This is the one caller that
  // builds its URL by hand rather than going through the RTK base query, so it
  // is the one that breaks silently if a bad value ever reaches the store.
  const baseUrl = normalizeApiBaseUrl(state.appConfig.apiBaseUrl);

  // Wrapped because this fetch is built by hand: a malformed base URL rejects
  // with a parse error rather than an HTTP status, and that message is not one
  // to show anybody.
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/uploads/signature`, {
      body: JSON.stringify({ target }),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method: "POST",
    });
  } catch (networkError) {
    console.error(`Upload signature request could not be sent to ${baseUrl}`, networkError);
    throw new UploadError("Could not reach the server to start the upload. Check your connection and try again.");
  }

  if (!response.ok) {
    console.error(`Upload signature request failed (${response.status}) for target ${target}`);
    throw new UploadError("Could not start the upload. Try again.");
  }

  try {
    return (await response.json()) as UploadSignature;
  } catch (parseError) {
    console.error(`Upload signature response was not JSON for target ${target}`, parseError);
    throw new UploadError("Could not start the upload. Try again.");
  }
}

/** Pickers do not always report a type; the extension is the next best source. */
function guessMimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "image/jpeg";
  }
}
