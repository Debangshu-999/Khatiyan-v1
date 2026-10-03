package com.khatiyan.d_modules.chat;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.chat.service.ChatService;

/**
 * Public facade for the chat module.
 *
 * <p>
 * Chat went without one for a long time because nothing called INTO it — the
 * lifecycle listener reacts to events from tenancy and property, and every other
 * entry is a controller. Enquiries answered over chat are the first case that
 * needs a synchronous answer back: the responder has to land in the conversation
 * they just opened, so an event would be a thread id arriving after the screen
 * that needed it.
 */
@Component
public class ChatModule {

    private final ChatService chatService;

    public ChatModule(ChatService chatService) {
        this.chatService = chatService;
    }

    /**
     * Opens (or finds) the conversation behind an answered enquiry.
     *
     * <p>
     * Idempotent on the enquiry id, which matters more than it looks: answering
     * the same enquiry over chat twice is an ordinary thing for two managers to
     * do, and it must land both of them in the same conversation rather than
     * forking the prospect into two.
     *
     * <p>
     * Called inside the caller's transaction, so an enquiry cannot be recorded
     * as answered-by-chat without the thread the answer lives in.
     *
     * @param enquiryMessage what the enquirer asked. A new conversation opens
     *                       with it, as their own first message
     * @return the thread id, for the screen that has to open it
     */
    public UUID openEnquiryThread(
            UUID propertyId, UUID enquiryId, UUID enquirerUserId, UUID responderUserId, String enquiryMessage) {
        return chatService
                .openEnquiryThread(propertyId, enquiryId, enquirerUserId, responderUserId, enquiryMessage)
                .getId();
    }

    /**
     * Closes the conversation of an enquiry, for both sides. Does nothing when
     * there is none, or it is closed already.
     *
     * <p>The enquiry module calls it when the handler ends the conversation,
     * and when the enquiry's date passes.
     */
    public void closeEnquiryThread(UUID enquiryId) {
        chatService.closeEnquiryThread(enquiryId);
    }

    /** Opens an enquiry's conversation again, when the enquirer reopens it. */
    public void reopenEnquiryThread(UUID enquiryId) {
        chatService.reopenEnquiryThread(enquiryId);
    }

    /**
     * Whether one person has written in a conversation after a moment.
     *
     * <p>For the enquiry module, which hears of messages one event at a time and
     * not always in the order they were sent. It asks this to tell that a reply
     * already followed the message it has just been told about.
     */
    public boolean hasWrittenSince(UUID threadId, UUID authorUserId, Instant since) {
        return chatService.hasWrittenSince(threadId, authorUserId, since);
    }
}
