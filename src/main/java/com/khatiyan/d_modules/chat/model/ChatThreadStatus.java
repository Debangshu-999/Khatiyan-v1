package com.khatiyan.d_modules.chat.model;

/** Whether a conversation still accepts messages. */
public enum ChatThreadStatus {

    OPEN,

    /**
     * Readable by both sides, writable by neither.
     *
     * <p>Reached by a tenancy ending, or by either party closing an enquiry
     * thread. Closing is not deleting: the history stays.
     */
    READ_ONLY
}
