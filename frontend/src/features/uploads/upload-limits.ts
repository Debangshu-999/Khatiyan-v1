/**
 * What each kind of upload accepts, for the UI to state up front.
 *
 * <p>The server is the authority: {@code UploadTarget} carries the same formats
 * as a signed `allowed_formats` parameter, so Cloudinary rejects anything else
 * whatever the client believes. These copies exist so a picker can filter and a
 * help panel can say the rules without a round trip — keep them in step with
 * `UploadTarget.java`.
 *
 * <p>Size is only ever enforced here. Cloudinary's upload API has no per-request
 * size parameter, so a hard ceiling would have to be set on the account itself.
 */
export const PHOTO_UPLOAD = {
  extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  maxBytes: 8 * 1024 * 1024,
  label: "JPG, PNG, WEBP or HEIC",
  maxLabel: "8 MB",
} as const;

export const DOCUMENT_UPLOAD = {
  extensions: ["pdf", "doc", "docx", "xls", "xlsx", "txt"],
  maxBytes: 10 * 1024 * 1024,
  label: "PDF, DOC, DOCX, XLS, XLSX or TXT",
  maxLabel: "10 MB",
  /** For DocumentPicker, which filters by MIME type rather than extension. */
  mimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ],
} as const;
