package com.khatiyan.d_modules.notice.model;

/**
 * Publication lifecycle for a notice.
 *
 * <p>Notices start as published in v1. Expired notices can move to archived
 * history, while deleted notices are hidden from all normal views but kept in
 * the database.
 */
public enum NoticeStatus {
    PUBLISHED,
    ARCHIVED,
    DELETED
}
