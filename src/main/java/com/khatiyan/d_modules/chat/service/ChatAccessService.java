package com.khatiyan.d_modules.chat.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadKind;
import com.khatiyan.d_modules.chat.repository.ChatThreadMemberRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.ManagerAccessLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

/**
 * Who may read and write which conversation.
 *
 * <p>The whole model is one sentence, and every other class in this module
 * defers to it rather than re-deriving it:
 *
 * <blockquote>You may read a thread if you are a named member of it, <b>or</b>
 * it is a {@code TEAM} thread and you have chat access to its
 * property.</blockquote>
 *
 * <p>Two consequences are worth stating because they are the reason it is
 * written this way:
 *
 * <ul>
 *   <li><b>Management membership is never stored.</b> It is resolved here, per
 *       request, from whoever currently manages the property. A membership row
 *       would freeze a set that changes — a manager added next week would be
 *       locked out of a conversation they are meant to cover, and one removed
 *       today would keep reading it.
 *   <li><b>The grant cannot reach a one-to-one.</b> {@code DIRECT} threads
 *       answer to membership alone. A permission that could revoke them would be
 *       revoking somebody's access to messages addressed personally to them,
 *       which is not a property owner's to withdraw.
 * </ul>
 */
@Service
public class ChatAccessService {

    private final ChatThreadRepository chatThreadRepository;
    private final ChatThreadMemberRepository chatThreadMemberRepository;
    private final PropertyModule propertyModule;

    public ChatAccessService(
            ChatThreadRepository chatThreadRepository,
            ChatThreadMemberRepository chatThreadMemberRepository,
            PropertyModule propertyModule) {
        this.chatThreadRepository = chatThreadRepository;
        this.chatThreadMemberRepository = chatThreadMemberRepository;
        this.propertyModule = propertyModule;
    }

    /**
     * Loads a thread the actor is allowed to see, or refuses.
     *
     * <p>Refuses with {@code NotFoundException} rather than a forbidden, on
     * purpose: a stranger probing thread ids should not be able to learn which
     * ones exist.
     */
    @Transactional(readOnly = true)
    public ChatThread requireReadable(UUID actorUserId, UUID threadId) {
        ChatThread thread = chatThreadRepository.findById(threadId)
                .orElseThrow(() -> new NotFoundException("Conversation", threadId.toString()));

        if (!canRead(actorUserId, thread)) {
            throw new NotFoundException("Conversation", threadId.toString());
        }
        return thread;
    }

    /**
     * Whether the actor may see this thread at all.
     *
     * <p>Membership is checked first because it is the cheaper question and the
     * commoner answer: the counterpart is always a member, and so is everyone in
     * a one-to-one.
     */
    @Transactional(readOnly = true)
    public boolean canRead(UUID actorUserId, ChatThread thread) {
        if (chatThreadMemberRepository.existsByThreadIdAndUserId(thread.getId(), actorUserId)) {
            return true;
        }
        return thread.getKind() == ChatThreadKind.TEAM
                && hasTeamAccess(actorUserId, thread.getPropertyId());
    }

    /**
     * Whether the actor can work the property's shared conversations.
     *
     * <p>The owner always can — {@code accessLevel} answers MANAGE for them
     * without a grant existing. A manager holds nothing until the owner adds
     * them in chat settings, which writes the same {@link ManagerResource#CHATS}
     * grant the manager-permissions screen shows.
     *
     * <p>A soft boolean rather than a throwing check, because the sections it
     * gates are hidden rather than disabled: a screen that showed a locked
     * Tenants tab would be claiming a restriction and then explaining it, and
     * the explanation is not the manager's business.
     */
    @Transactional(readOnly = true)
    public boolean hasTeamAccess(UUID actorUserId, UUID propertyId) {
        try {
            return propertyModule.accessLevel(actorUserId, propertyId, ManagerResource.CHATS)
                    != ManagerAccessLevel.NONE;
        } catch (RuntimeException refused) {
            // Not management here at all. accessLevel throws for a stranger, and
            // "not management" and "management without the grant" are the same
            // answer to this question.
            return false;
        }
    }

    /** Refuses outright, for the endpoints that list a property's shared sections. */
    @Transactional(readOnly = true)
    public void requireTeamAccess(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManage(actorUserId, propertyId, ManagerResource.CHATS);
    }

    /**
     * Whether the actor is one of the named people, as opposed to management
     * reading a shared thread. Drives who may close an enquiry conversation.
     */
    @Transactional(readOnly = true)
    public boolean isMember(UUID actorUserId, UUID threadId) {
        return chatThreadMemberRepository.existsByThreadIdAndUserId(threadId, actorUserId);
    }
}
