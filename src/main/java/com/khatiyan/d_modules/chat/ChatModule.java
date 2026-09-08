package com.khatiyan.d_modules.chat;

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
     * @return the thread id, for the screen that has to open it
     */
    public UUID openEnquiryThread(UUID propertyId, UUID enquiryId, UUID enquirerUserId, UUID responderUserId) {
        return chatService.openEnquiryThread(propertyId, enquiryId, enquirerUserId, responderUserId).getId();
    }
}
