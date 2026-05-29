package com.khatiyan.d_modules.notice.model;

/**
 * Visibility weight for property notices.
 *
 * <p>Notices are free-form communications, so priority tells the UI how
 * prominently a notice should be shown without forcing a fixed notice type.
 */
public enum NoticePriority {
    NORMAL,
    IMPORTANT,
    URGENT,
    EMERGENCY
}
