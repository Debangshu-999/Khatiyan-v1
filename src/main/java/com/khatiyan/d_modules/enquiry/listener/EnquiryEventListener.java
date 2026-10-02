package com.khatiyan.d_modules.enquiry.listener;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.chat.event.ChatMessageSentEvent;
import com.khatiyan.d_modules.enquiry.service.EnquiryService;
import com.khatiyan.d_modules.property.event.ManagerRemovedEvent;

/**
 * What the enquiry module hears from other modules.
 *
 * <p>{@code @ApplicationModuleListener} runs after the sender's transaction
 * commits, in its own, and delivers at least once. Both handlers below do
 * nothing on a repeat: a chat attempt already recorded or settled is left as it
 * is, and a manager's enquiries can only be returned to the owner once.
 */
@Component
public class EnquiryEventListener {

    private final EnquiryService enquiryService;

    public EnquiryEventListener(EnquiryService enquiryService) {
        this.enquiryService = enquiryService;
    }

    /**
     * Chat attempts are read off messages: management's first message is the
     * attempt, and the enquirer's reply settles it. Chat sends this for every
     * conversation. The service ignores the ones that are not an enquiry's.
     */
    @ApplicationModuleListener
    public void onChatMessageSent(ChatMessageSentEvent event) {
        enquiryService.onChatMessage(event);
    }

    /** A manager who leaves cannot go on handling enquiries. They return to the owner. */
    @ApplicationModuleListener
    public void onManagerRemoved(ManagerRemovedEvent event) {
        enquiryService.onManagerRemoved(event.propertyId(), event.managerUserId());
    }
}
