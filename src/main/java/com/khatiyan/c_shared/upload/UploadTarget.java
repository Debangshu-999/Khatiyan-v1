package com.khatiyan.c_shared.upload;

/**
 * What is being uploaded, and therefore where it may land.
 *
 * <p>The client names a target rather than a folder. If it named the folder, a
 * caller could sign a concern photo into the profile-photo directory — the
 * signature would be valid and the placement wrong. An enum keeps the mapping on
 * this side.
 *
 * <p>{@code raw} vs {@code image} matters to Cloudinary: raw files skip
 * thumbnailing and transformation, which is what a PDF on a notice needs.
 */
public enum UploadTarget {

    CONCERN_PHOTO("khatiyan/concerns", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    PAYMENT_PROOF("khatiyan/payments", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    PROFILE_PHOTO("khatiyan/profiles", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    PROPERTY_IMAGE("khatiyan/properties", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    /** A photo of a room type, not of a particular room. */
    ROOM_TYPE_IMAGE("khatiyan/room-types", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    /** A catalogue image for a food item configured at a property. */
    FOOD_ITEM_IMAGE("khatiyan/food-items", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    LOCAL_PLACE_PHOTO("khatiyan/local-places", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    NOTICE_IMAGE("khatiyan/notices", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    /** Notices accept PDFs and the like, which must not be treated as images. */
    NOTICE_DOCUMENT("khatiyan/notices", ResourceType.RAW, Limits.DOCUMENT_FORMATS, Limits.MB * 5),

    /** A page of an existing tenant's paper agreement, kept on file at onboarding (2026-10-28). */
    AGREEMENT_PHOTO("khatiyan/agreements", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    /** The same paper agreement as a PDF, beside or instead of its photos (user, 2026-10-28). RAW, as notices. */
    AGREEMENT_DOCUMENT("khatiyan/agreements", ResourceType.RAW, Limits.PDF_FORMATS, Limits.MB * 5),
    /** A photo of the room on its move-in checklist (2026-10-29). */
    MOVE_IN_PHOTO("khatiyan/move-ins", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),

    CHAT_IMAGE("khatiyan/chat", ResourceType.IMAGE, Limits.PHOTO_FORMATS, Limits.PHOTO_MAX),
    /**
     * Documents sent in a conversation — an agreement, a bill, a receipt.
     *
     * <p>RAW for the same reason notices are: Cloudinary would try to thumbnail
     * and transform a PDF as though it were a picture.
     */
    CHAT_FILE("khatiyan/chat", ResourceType.RAW, Limits.DOCUMENT_FORMATS, Limits.MB * 5);

    private final String folder;
    private final ResourceType resourceType;
    private final String allowedFormats;
    private final long maxBytes;

    UploadTarget(String folder, ResourceType resourceType, String allowedFormats, long maxBytes) {
        this.folder = folder;
        this.resourceType = resourceType;
        this.allowedFormats = allowedFormats;
        this.maxBytes = maxBytes;
    }

    public String folder() {
        return folder;
    }

    public ResourceType resourceType() {
        return resourceType;
    }

    /**
     * Comma-separated formats Cloudinary will accept, sent as a signed
     * parameter. This is the real gate: a client that ignores its own checks
     * still cannot put a zip in the photo folder, because the upload is rejected
     * at Cloudinary against a list the client could not alter without breaking
     * the signature.
     */
    public String allowedFormats() {
        return allowedFormats;
    }

    /**
     * Ceiling for a single file.
     *
     * <p>Advisory rather than enforced here: Cloudinary's upload API has no
     * per-request size parameter, so this is published to the client to check
     * before uploading and to state in its error message. A hard ceiling has to
     * be set on the Cloudinary account or upload preset.
     */
    public long maxBytes() {
        return maxBytes;
    }

    /**
     * Held in a nested type because an enum constant's arguments may not
     * reference the enum's own static fields — they are initialised after the
     * constants are constructed.
     */
    private static final class Limits {
        /** Raster formats a phone camera or gallery actually produces. */
        static final String PHOTO_FORMATS = "jpg,jpeg,png,webp,heic,heif";
        static final String DOCUMENT_FORMATS = "pdf,doc,docx,xls,xlsx,txt";
        static final String PDF_FORMATS = "pdf";
        static final long MB = 1024L * 1024L;
        /**
         * Every photo, 500 KB (user, 2026-10-28): the app shrinks a camera photo
         * to fit before upload. Files are 5 MB.
         */
        static final long PHOTO_MAX = 500L * 1024L;

        private Limits() {
        }
    }

    public enum ResourceType {
        IMAGE("image"),
        RAW("raw");

        private final String value;

        ResourceType(String value) {
            this.value = value;
        }

        public String value() {
            return value;
        }
    }
}
