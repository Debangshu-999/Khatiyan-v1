package com.khatiyan.d_modules.chat.service;

import java.util.Optional;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.chat.repository.ChatThreadRepository;
import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;

import lombok.extern.slf4j.Slf4j;

/**
 * What the rest of the app does to a conversation.
 *
 * <p>Chat listens; it never reaches into another module to ask. The only two
 * things outside this module that change a thread are a stay ending and a stay
 * being cancelled, and both arrive as events.
 *
 * <p><b>Nothing here handles a manager being removed, and that is deliberate.</b>
 * A removed manager loses the shared sections the instant they lose the grant,
 * because {@link ChatAccessService} resolves management per request rather than
 * from stored rows — there is no membership to clean up. Their own one-to-one
 * threads and their own enquiry conversations are untouched, because those were
 * never the property's to take away.
 *
 * <p>Listeners are {@code @ApplicationModuleListener}, which is at-least-once,
 * so everything here has to be safe to run twice. Closing a thread is idempotent
 * by construction.
 *
 * <p><b>Do not add {@code @Transactional} beside it.</b> The annotation already
 * composes {@code @Transactional(REQUIRES_NEW)}, and a second one overrides that
 * with the default propagation — which a transactional event listener refuses
 * outright, taking the whole application down at startup rather than
 * misbehaving quietly. Every other listener in this codebase is bare for the
 * same reason.
 */
@Slf4j
@Component
public class ChatLifecycleListener {

    private final ChatThreadRepository chatThreadRepository;

    public ChatLifecycleListener(ChatThreadRepository chatThreadRepository) {
        this.chatThreadRepository = chatThreadRepository;
    }

    /**
     * A stay ends, so its team conversation stops accepting messages.
     *
     * <p>Read-only rather than deleted: both sides keep what was said, and a
     * former tenant chasing a deposit still has the record of being told it was
     * coming. Coming back later is a new tenancy and therefore a new thread —
     * the same rule the nudge cooldown uses for keying on the stay rather than
     * the person.
     */
    @ApplicationModuleListener
    public void onTenancyEnded(TenancyEndedEvent event) {
        closeThreadFor(event.tenancyId(), "ended");
    }

    /**
     * A stay is cancelled before it begins.
     *
     * <p>Usually there is no thread at all — nobody messaged anyone about a stay
     * that never started — which is why this looks up rather than assuming.
     */
    @ApplicationModuleListener
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        closeThreadFor(event.tenancyId(), "cancelled");
    }

    private void closeThreadFor(java.util.UUID tenancyId, String reason) {
        Optional<ChatThread> thread =
                chatThreadRepository.findByOriginAndOriginId(ChatThreadOrigin.TENANCY, tenancyId);

        if (thread.isEmpty()) {
            return;
        }

        thread.get().close();
        log.info("Chat team thread closed tenancyId={} threadId={} reason={}",
                tenancyId, thread.get().getId(), reason);
    }
}
