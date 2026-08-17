package com.khatiyan.d_modules.notice.model;

/**
 * How an attachment is meant to be read.
 *
 * <p>Stored rather than derived from the content type: the reader's experience
 * differs (a slideshow versus a file row), and that intent is fixed when the
 * file is picked — the picker already knew which one the person chose.
 */
public enum NoticeAttachmentKind {
    IMAGE,
    DOCUMENT
}
