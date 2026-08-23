package com.khatiyan.d_modules.chat.service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.khatiyan.d_modules.chat.model.ChatMessage;
import com.khatiyan.d_modules.chat.model.ChatReadState;
import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadKind;
import com.khatiyan.d_modules.chat.model.ChatThreadMember;
import com.khatiyan.d_modules.chat.repository.ChatReadStateRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadMemberRepository;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Tells the other side that something is waiting.
 *
 * <p><b>The push is an announcement, never the message.</b> Delivery already
 * happened when the row committed; if every push were dropped, nothing would be
 * lost — readers would simply find out later. That is what makes it safe to
 * suppress pushes as aggressively as this class does.
 *
 * <p>The body carries no message text on purpose. A lock-screen preview would
 * let somebody read a conversation without opening the app, which would then be
 * reported as read when it never was — and it leaks a tenant's words to whoever
 * is holding the phone.
 */
@Slf4j
@Service
public class ChatNotifier {

    /**
     * A recipient reading a thread this recently is taken to be sitting in it.
     *
     * <p>Without this, an open conversation pushes on every message: the client
     * marks read as messages arrive, which leaves the recipient permanently
     * "caught up" and therefore permanently eligible for the next alert.
     */
    private static final Duration ACTIVELY_READING = Duration.ofMinutes(2);

    /** A hard floor between pushes for one thread and one person. */
    private static final Duration PUSH_COOLDOWN = Duration.ofMinutes(5);

    private static final String COOLDOWN_KEY_PREFIX = "khatiyan:chat:pushed:";

    private final ChatThreadMemberRepository chatThreadMemberRepository;
    private final ChatReadStateRepository chatReadStateRepository;
    private final ChatAccessService chatAccessService;
    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;
    private final StringRedisTemplate valkeyTemplate;

    public ChatNotifier(
            ChatThreadMemberRepository chatThreadMemberRepository,
            ChatReadStateRepository chatReadStateRepository,
            ChatAccessService chatAccessService,
            NotificationModule notificationModule,
            PropertyModule propertyModule,
            StringRedisTemplate valkeyTemplate) {
        this.chatThreadMemberRepository = chatThreadMemberRepository;
        this.chatReadStateRepository = chatReadStateRepository;
        this.chatAccessService = chatAccessService;
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
        this.valkeyTemplate = valkeyTemplate;
    }

    /**
     * Announces one message to whoever did not send it.
     *
     * <p>Never throws into the send path. A message that committed is delivered;
     * failing the request because the doorbell did not ring would be undoing real
     * work over an announcement.
     */
    public void announce(ChatThread thread, ChatMessage message, String senderName) {
        try {
            PropertyResponse property = propertyModule.getActiveProperty(thread.getPropertyId());
            String title = titleFor(thread, senderName, property.name());

            for (UUID recipient : recipientsOf(thread, message.getAuthorUserId(), property)) {
                if (!shouldPush(thread, recipient)) {
                    continue;
                }
                push(thread, recipient, title, property);
            }
        } catch (RuntimeException failure) {
            log.warn("Chat push announcement failed threadId={} messageId={}",
                    thread.getId(), message.getId(), failure);
        }
    }

    /**
     * Everyone who should hear about it.
     *
     * <p>For a team thread the management side is resolved live, exactly as
     * reading is — so a manager added this morning is alerted and one removed
     * this afternoon is not, with no list to keep in step.
     */
    private Set<UUID> recipientsOf(ChatThread thread, UUID senderUserId, PropertyResponse property) {
        Set<UUID> members = new HashSet<>();
        for (ChatThreadMember member : chatThreadMemberRepository.findByThreadId(thread.getId())) {
            members.add(member.getUserId());
        }

        Set<UUID> recipients = new HashSet<>();
        if (thread.getKind() == ChatThreadKind.DIRECT) {
            recipients.addAll(members);
        } else {
            // The outsider, plus the whole management side.
            recipients.addAll(members);
            recipients.add(property.ownerId());
            for (UUID managerUserId : propertyModule.findActiveManagerUserIds(thread.getPropertyId())) {
                if (chatAccessService.hasTeamAccess(managerUserId, thread.getPropertyId())) {
                    recipients.add(managerUserId);
                }
            }
        }

        recipients.remove(senderUserId);
        return recipients;
    }

    /**
     * Two independent brakes, either of which is enough to stay quiet.
     *
     * <p>The spec originally paired the cooldown with "only when they have
     * nothing unread". That reads well and is wrong in the commonest case: a
     * recipient with the thread OPEN is marked read as each message lands, so
     * they are always caught up and therefore always eligible — the one person
     * who least needs telling gets every alert. Recency of reading is the honest
     * proxy for "they are already looking".
     */
    private boolean shouldPush(ChatThread thread, UUID recipientUserId) {
        Optional<ChatReadState> readState =
                chatReadStateRepository.findByThreadIdAndUserId(thread.getId(), recipientUserId);

        if (readState.isPresent() && readState.get().getUpdatedAt() != null
                && readState.get().getUpdatedAt().isAfter(Instant.now().minus(ACTIVELY_READING))) {
            return false;
        }

        // setIfAbsent is the whole cooldown: the first caller writes the key and
        // wins, everyone else within the TTL sees it already there. No read-then-
        // write race, because it is one atomic operation.
        Boolean claimed = valkeyTemplate.opsForValue()
                .setIfAbsent(cooldownKey(thread.getId(), recipientUserId), "1", PUSH_COOLDOWN);
        return Boolean.TRUE.equals(claimed);
    }

    private void push(ChatThread thread, UUID recipientUserId, String title, PropertyResponse property) {
        notificationModule.notifyUser(
                recipientUserId,
                title,
                "Open the app to read it.",
                NotificationCategory.CHAT,
                NotificationPriority.NORMAL,
                NotificationSubtype.CHAT_MESSAGE_RECEIVED,
                thread.getId(),
                Map.of(
                        "threadId", thread.getId().toString(),
                        "propertyId", thread.getPropertyId().toString()),
                NotificationDeliveryMode.PUSH_ONLY,
                audienceFor(thread, recipientUserId, property));
    }

    /**
     * What the alert says, carrying no message text.
     *
     * <p>A tenant writing to the team hears from the property, because that is
     * who they addressed; management hears the person's name and which property,
     * since they may be reading several.
     */
    private String titleFor(ChatThread thread, String senderName, String propertyName) {
        String sender = senderName == null || senderName.isBlank() ? "Someone" : senderName;
        if (thread.getKind() == ChatThreadKind.TEAM) {
            return "New message from " + sender + " · " + propertyName;
        }
        return "New message from " + sender;
    }

    /**
     * Which workspace the recipient is reading in.
     *
     * <p>PUSH_ONLY rows are archived as they are written, so this never decides
     * what a feed shows — but the subtype is dual-audience and the caller is
     * required to say.
     */
    private NotificationAudience audienceFor(
            ChatThread thread, UUID recipientUserId, PropertyResponse property) {
        boolean management = property.ownerId().equals(recipientUserId)
                || chatAccessService.hasTeamAccess(recipientUserId, thread.getPropertyId());
        return management ? NotificationAudience.MANAGEMENT : NotificationAudience.TENANT;
    }

    private String cooldownKey(UUID threadId, UUID userId) {
        return COOLDOWN_KEY_PREFIX + threadId + ":" + userId;
    }

}
