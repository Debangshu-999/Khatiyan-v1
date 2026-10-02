package com.khatiyan.d_modules.chat.event;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;

/**
 * Somebody wrote in a conversation.
 *
 * <p>Carries no text. A listener learns that a message was sent, by whom and in
 * what kind of conversation, and nothing of what was said: the enquiry module
 * uses it to tell that an enquirer replied, which needs only the fact of it.
 *
 * @param origin   what the conversation was opened for
 * @param originId the enquiry, tenancy or other record it belongs to, as the
 *                 thread stores it
 */
public record ChatMessageSentEvent(
        UUID threadId,
        UUID propertyId,
        ChatThreadOrigin origin,
        UUID originId,
        UUID senderUserId,
        Instant sentAt) {
}
