package com.khatiyan.d_modules.enquiry.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.d_modules.enquiry.api.dto.EmailChannelState;
import com.khatiyan.d_modules.enquiry.api.dto.ReachableChannelResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

/**
 * Which channels an enquirer can be reached on, decided once.
 *
 * <p>Both sides render from this list — the enquirer's confirmation dialog and
 * the owner's respond sheet — and the respond endpoint validates against it. If
 * it were computed twice the two would drift, and the drift would surface as an
 * owner promising an email to an address nobody has proved they can read.
 */
class EnquiryChannelTest {

    private static UserSummaryResponse user(String phone, String email, boolean emailVerified) {
        return new UserSummaryResponse(
                UUID.randomUUID(),
                phone,
                email,
                "Anita Rao",
                null,
                UserRole.USER,
                false,
                true,
                true,
                emailVerified,
                true);
    }

    /** A verified phone is a precondition of having an account, so it is always offered. */
    @Test
    void alwaysOffersCallBack() {
        var channels = EnquiryService.reachableChannels(user("+919000000000", null, false));

        assertThat(channels).extracting(ReachableChannelResponse::channel)
                .containsExactly(EnquiryResponseChannel.CALL_BACK);
        assertThat(channels.get(0).target()).isEqualTo("+919000000000");
    }

    @Test
    void offersEmailOnlyWhenVerified() {
        var channels = EnquiryService.reachableChannels(user("+919000000000", "anita@example.com", true));

        assertThat(channels).extracting(ReachableChannelResponse::channel)
                .containsExactly(EnquiryResponseChannel.CALL_BACK, EnquiryResponseChannel.EMAIL);
        assertThat(channels.get(1).target()).isEqualTo("anita@example.com");
    }

    /**
     * The case that matters. An address on file is not an address anyone has
     * proved they can read, and offering it sends the owner's reply nowhere.
     */
    @Test
    void withholdsAnUnverifiedEmail() {
        var channels = EnquiryService.reachableChannels(user("+919000000000", "anita@example.com", false));

        assertThat(channels).extracting(ReachableChannelResponse::channel)
                .containsExactly(EnquiryResponseChannel.CALL_BACK);
    }

    @Test
    void treatsABlankEmailAsAbsent() {
        var channels = EnquiryService.reachableChannels(user("+919000000000", "   ", true));

        assertThat(channels).extracting(ReachableChannelResponse::channel)
                .containsExactly(EnquiryResponseChannel.CALL_BACK);
    }

    /** Chat is not a channel anyone can be reached on until chat exists. */
    @Test
    void neverOffersChat() {
        var channels = EnquiryService.reachableChannels(user("+919000000000", "anita@example.com", true));

        assertThat(channels).extracting(ReachableChannelResponse::channel)
                .doesNotContain(EnquiryResponseChannel.CHAT);
    }

    @Test
    void handlesAMissingUser() {
        assertThat(EnquiryService.reachableChannels(null)).isEmpty();
        assertThat(EnquiryService.emailChannelState(null)).isEqualTo(EmailChannelState.NOT_REGISTERED);
    }

    // The footnote tells the enquirer to fix the one thing that is missing —
    // "register and verify" against "verify" are different instructions, and
    // telling someone to add an email they already added reads as inattention.

    @Test
    void distinguishesAMissingEmailFromAnUnverifiedOne() {
        assertThat(EnquiryService.emailChannelState(user("+919000000000", null, false)))
                .isEqualTo(EmailChannelState.NOT_REGISTERED);
        assertThat(EnquiryService.emailChannelState(user("+919000000000", "  ", false)))
                .isEqualTo(EmailChannelState.NOT_REGISTERED);
        assertThat(EnquiryService.emailChannelState(user("+919000000000", "anita@example.com", false)))
                .isEqualTo(EmailChannelState.UNVERIFIED);
        assertThat(EnquiryService.emailChannelState(user("+919000000000", "anita@example.com", true)))
                .isEqualTo(EmailChannelState.AVAILABLE);
    }
}
