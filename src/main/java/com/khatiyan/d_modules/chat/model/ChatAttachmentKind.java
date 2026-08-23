package com.khatiyan.d_modules.chat.model;

/**
 * Whether an attachment is a picture or a document.
 *
 * <p>Mirrors the {@code IMAGE}/{@code RAW} split the upload targets already
 * make: Cloudinary thumbnails and transforms images, and must not try to do
 * either to a PDF.
 */
public enum ChatAttachmentKind {
    IMAGE,
    FILE
}
