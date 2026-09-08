package com.khatiyan.d_modules.enquiry.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.a_auth.model.UserRole;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryChannelOption;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryChannelConsent;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.repository.EnquiryChannelConsentRepository;

/**
 * The agreement tick is load-bearing or it is theatre.
 *
 * <p>These tests pin the two things that make it real: a channel cannot be added
 * without it, and it is not demanded where there is nothing to agree to. The
 * second half matters as much as the first — a tick asked for on every save is a
 * tick people learn to click through, which is exactly the failure the flow
 * exists to prevent.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EnquiryChannelConsentServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private EnquiryChannelConsentRepository consentRepository;

    @Mock
    private AuthModule authModule;

    private EnquiryChannelConsentService service;

    private final List<EnquiryChannelConsent> stored = new ArrayList<>();

    @BeforeEach
    void setUp() {
        service = new EnquiryChannelConsentService(consentRepository, authModule);
        stored.clear();

        when(authModule.findById(USER_ID)).thenReturn(Optional.of(user("+919000000000", "anita@example.com", true)));
        when(consentRepository.findByUserIdAndRevokedAtIsNull(USER_ID))
                .thenAnswer(invocation -> stored.stream().filter(EnquiryChannelConsent::isLive).toList());
        when(consentRepository.saveAll(any())).thenAnswer(invocation -> {
            Iterable<EnquiryChannelConsent> saved = invocation.getArgument(0);
            for (EnquiryChannelConsent consent : saved) {
                if (!stored.contains(consent)) {
                    stored.add(consent);
                }
            }
            return List.of();
        });
    }

    private static UserSummaryResponse user(String phone, String email, boolean emailVerified) {
        return new UserSummaryResponse(
                USER_ID, phone, email, "Anita Rao", null, UserRole.USER,
                false, true, true, emailVerified, true);
    }

    private static UpdateEnquiryChannelConsentsRequest request(boolean agreed, EnquiryResponseChannel... channels) {
        return new UpdateEnquiryChannelConsentsRequest(Set.of(channels), agreed);
    }

    // ---- The tick --------------------------------------------------------

    @Test
    void refusesToAddAChannelWithoutTheAgreement() {
        assertThatThrownBy(() -> service.replace(USER_ID, request(false, EnquiryResponseChannel.CALL_BACK)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Tick the agreement");

        assertThat(stored).isEmpty();
    }

    @Test
    void addsTheChannelWhenAgreed() {
        var result = service.replace(USER_ID, request(true, EnquiryResponseChannel.CALL_BACK));

        assertThat(granted(result.channels())).containsExactly(EnquiryResponseChannel.CALL_BACK);
        assertThat(result.anyGranted()).isTrue();
        assertThat(stored).singleElement().satisfies(consent -> {
            assertThat(consent.getChannel()).isEqualTo(EnquiryResponseChannel.CALL_BACK);
            assertThat(consent.isLive()).isTrue();
            assertThat(consent.getTermsVersion()).isEqualTo(EnquiryChannelConsent.CURRENT_TERMS_VERSION);
        });
    }

    /**
     * Revoking is not a fresh decision, so it must not demand a fresh tick.
     * Otherwise turning something OFF asks you to agree to something.
     */
    @Test
    void revokingNeedsNoAgreement() {
        service.replace(USER_ID, request(true, EnquiryResponseChannel.CALL_BACK, EnquiryResponseChannel.EMAIL));

        var result = service.replace(USER_ID, request(false, EnquiryResponseChannel.CALL_BACK));

        assertThat(granted(result.channels())).containsExactly(EnquiryResponseChannel.CALL_BACK);
        assertThat(stored).filteredOn(consent -> consent.getChannel() == EnquiryResponseChannel.EMAIL)
                .singleElement()
                .satisfies(consent -> assertThat(consent.isLive()).isFalse());
    }

    /** Re-sending what is already live changes nothing and asks for nothing. */
    @Test
    void resendingTheSameSetIsANoOp() {
        service.replace(USER_ID, request(true, EnquiryResponseChannel.CALL_BACK));

        var result = service.replace(USER_ID, request(false, EnquiryResponseChannel.CALL_BACK));

        assertThat(granted(result.channels())).containsExactly(EnquiryResponseChannel.CALL_BACK);
        assertThat(stored).hasSize(1);
    }

    // ---- What can be agreed to -------------------------------------------

    /** Agreeing to be emailed at an address nobody verified is agreeing to nothing. */
    @Test
    void refusesAnUnverifiedEmail() {
        when(authModule.findById(USER_ID)).thenReturn(Optional.of(user("+919000000000", "anita@example.com", false)));

        assertThatThrownBy(() -> service.replace(USER_ID, request(true, EnquiryResponseChannel.EMAIL)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Verify your email");
    }

    /** CHAT is the medium, not a detail handed over, so it is never stored. */
    @Test
    void refusesChat() {
        assertThatThrownBy(() -> service.replace(USER_ID, request(true, EnquiryResponseChannel.CHAT)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("needs no agreement");
    }

    @Test
    void allowsGrantingNothing() {
        service.replace(USER_ID, request(true, EnquiryResponseChannel.CALL_BACK));

        var result = service.replace(USER_ID, new UpdateEnquiryChannelConsentsRequest(Set.of(), false));

        assertThat(granted(result.channels())).isEmpty();
        assertThat(result.anyGranted()).isFalse();
    }

    // ---- Reporting -------------------------------------------------------

    /**
     * A grant survives the email being unverified afterwards, and must not be
     * reported as live: saying "granted" would promise a reply that cannot be
     * sent.
     */
    @Test
    void reportsAGrantOnAnUnusableChannelAsNotGranted() {
        service.replace(USER_ID, request(true, EnquiryResponseChannel.EMAIL));
        when(authModule.findById(USER_ID)).thenReturn(Optional.of(user("+919000000000", "anita@example.com", false)));

        var result = service.myConsents(USER_ID);

        assertThat(granted(result.channels())).isEmpty();
        assertThat(result.anyGranted()).isFalse();
        assertThat(result.channels()).filteredOn(option -> option.channel() == EnquiryResponseChannel.EMAIL)
                .singleElement()
                .satisfies(option -> assertThat(option.available()).isFalse());
    }

    /** Every channel is listed even when it cannot be used, so the screen can
     *  say why rather than silently omitting a row. Chat leads, as the baseline
     *  the others are added on top of. */
    @Test
    void alwaysListsEveryChannelWithChatFirst() {
        var result = service.myConsents(USER_ID);

        assertThat(result.channels()).extracting(EnquiryChannelOption::channel)
                .containsExactly(
                        EnquiryResponseChannel.CHAT,
                        EnquiryResponseChannel.CALL_BACK,
                        EnquiryResponseChannel.EMAIL);
    }

    // ---- Chat is not the enquirer's to decide ----------------------------

    /** Drawn ticked and locked, with nothing stored behind it. */
    @Test
    void reportsChatAsGrantedAndLocked() {
        var result = service.myConsents(USER_ID);

        assertThat(result.channels()).first().satisfies(option -> {
            assertThat(option.channel()).isEqualTo(EnquiryResponseChannel.CHAT);
            assertThat(option.granted()).isTrue();
            assertThat(option.locked()).isTrue();
            assertThat(option.available()).isTrue();
            // Nothing to hand over is the reason it needs no agreement.
            assertThat(option.target()).isNull();
        });
        assertThat(stored).isEmpty();
    }

    /**
     * The trap this guards. Chat is always granted, so counting it would make
     * every account look already-consented and the modal would never open.
     */
    @Test
    void chatDoesNotCountTowardsAnyGranted() {
        assertThat(service.myConsents(USER_ID).anyGranted()).isFalse();
    }

    /** Only the channels someone actually decided about. Chat is never one. */
    private static List<EnquiryResponseChannel> granted(List<EnquiryChannelOption> options) {
        return options.stream()
                .filter(option -> option.granted() && !option.locked())
                .map(EnquiryChannelOption::channel)
                .toList();
    }
}
