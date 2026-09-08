package com.khatiyan.d_modules.enquiry.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * What an enquirer shared is fixed when they ask, not looked up when answered.
 *
 * <p>Consent is a standing per-person decision, but reading it live let an
 * enquiry already sitting in a property's queue change shape underneath them —
 * a number they were told they could call disappearing mid-conversation because
 * a switch moved in account settings. The snapshot is what makes withdrawal
 * forward-only in the only sense that can honestly be promised.
 */
class EnquirySharedChannelsTest {

    private static Enquiry raise(Set<EnquiryResponseChannel> shared) {
        return Enquiry.raise(UUID.randomUUID(), UUID.randomUUID(), "Is a single AC room free?", shared);
    }

    @Test
    void keepsTheChannelsItWasRaisedWith() {
        Enquiry enquiry = raise(EnumSet.of(EnquiryResponseChannel.CALL_BACK, EnquiryResponseChannel.EMAIL));

        assertThat(enquiry.getSharedChannels())
                .containsExactlyInAnyOrder(EnquiryResponseChannel.CALL_BACK, EnquiryResponseChannel.EMAIL);
    }

    /**
     * Chat is always open and was never handed over, so it is not part of what
     * was shared. Storing it would imply it could later be found missing.
     */
    @Test
    void dropsChatFromTheSnapshot() {
        Enquiry enquiry = raise(EnumSet.of(EnquiryResponseChannel.CHAT, EnquiryResponseChannel.CALL_BACK));

        assertThat(enquiry.getSharedChannels()).containsExactly(EnquiryResponseChannel.CALL_BACK);
    }

    @Test
    void keepsAnEmptySetEmpty() {
        assertThat(raise(EnumSet.noneOf(EnquiryResponseChannel.class)).getSharedChannels()).isEmpty();
    }

    /**
     * The whole point: a copy, not a view. If the enquiry held the caller's set
     * it would still be reading live consent, just through a longer wire.
     */
    @Test
    void doesNotFollowTheCallersSetAfterwards() {
        Set<EnquiryResponseChannel> consented = EnumSet.of(EnquiryResponseChannel.CALL_BACK);
        Enquiry enquiry = raise(consented);

        consented.remove(EnquiryResponseChannel.CALL_BACK);
        consented.add(EnquiryResponseChannel.EMAIL);

        assertThat(enquiry.getSharedChannels()).containsExactly(EnquiryResponseChannel.CALL_BACK);
    }
}
