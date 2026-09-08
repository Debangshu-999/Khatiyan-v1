package com.khatiyan.d_modules.enquiry.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryChannelConsentResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryChannelOption;
import com.khatiyan.d_modules.enquiry.api.dto.UpdateEnquiryChannelConsentsRequest;
import com.khatiyan.d_modules.enquiry.model.EnquiryChannelConsent;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.repository.EnquiryChannelConsentRepository;

import lombok.extern.slf4j.Slf4j;

/**
 * Who has agreed to be contacted on what.
 *
 * <p>
 * The enquirer's half of the reachability rule. {@code EnquiryService} owns the
 * other half — whether a channel is technically usable at all — and the two meet
 * in {@code EnquiryService.reachableChannels}, which remains the single decider.
 * Keeping consent here rather than there is what stops the account-settings
 * screen having to reach into enquiry answering to change a switch.
 *
 * <p>
 * <b>CHAT is not a grantable channel.</b> It is the medium an enquiry lives in
 * rather than a detail handed over, so it is never stored, never offered, and
 * never revocable. The moment chat exists, this service stops being the thing
 * standing between an enquiry and an answer.
 */
@Slf4j
@Service
public class EnquiryChannelConsentService {

    /**
     * The channels an enquirer can grant, in the order the modal lists them.
     *
     * <p>
     * Phone first because it is the one that always works and the one PG
     * business actually runs on.
     */
    private static final List<EnquiryResponseChannel> GRANTABLE =
            List.of(EnquiryResponseChannel.CALL_BACK, EnquiryResponseChannel.EMAIL);

    private final EnquiryChannelConsentRepository consentRepository;
    private final AuthModule authModule;

    public EnquiryChannelConsentService(
            EnquiryChannelConsentRepository consentRepository,
            AuthModule authModule) {
        this.consentRepository = consentRepository;
        this.authModule = authModule;
    }

    // ---- Reads -----------------------------------------------------------

    /** The live grants for one person. */
    @Transactional(readOnly = true)
    public Set<EnquiryResponseChannel> liveChannels(UUID userId) {
        Set<EnquiryResponseChannel> channels = EnumSet.noneOf(EnquiryResponseChannel.class);
        for (EnquiryChannelConsent consent : consentRepository.findByUserIdAndRevokedAtIsNull(userId)) {
            channels.add(consent.getChannel());
        }
        return channels;
    }

    /**
     * Live grants for several people at once.
     *
     * <p>
     * The management enquiry list renders every card's channels. Asking per card
     * would be a query per row for an answer one query can give.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Set<EnquiryResponseChannel>> liveChannelsFor(Collection<UUID> userIds) {
        Map<UUID, Set<EnquiryResponseChannel>> byUser = new HashMap<>();
        if (userIds.isEmpty()) {
            return byUser;
        }
        for (EnquiryChannelConsent consent : consentRepository.findByUserIdInAndRevokedAtIsNull(userIds)) {
            byUser
                    .computeIfAbsent(consent.getUserId(), key -> EnumSet.noneOf(EnquiryResponseChannel.class))
                    .add(consent.getChannel());
        }
        return byUser;
    }

    /** What the consent modal and the account settings section both render from. */
    @Transactional(readOnly = true)
    public EnquiryChannelConsentResponse myConsents(UUID userId) {
        UserSummaryResponse user = authModule.findById(userId).orElse(null);
        return describe(user, liveChannels(userId));
    }

    // ---- Writes ----------------------------------------------------------

    /**
     * Makes the stored set match the requested one.
     *
     * <p>
     * Adding a channel needs the agreement tick and needs the channel to be
     * usable — agreeing to be emailed at an address nobody has verified is
     * agreeing to nothing. Removing one needs neither.
     */
    @Transactional
    public EnquiryChannelConsentResponse replace(UUID userId, UpdateEnquiryChannelConsentsRequest request) {
        UserSummaryResponse user = authModule.findById(userId).orElse(null);

        Set<EnquiryResponseChannel> requested = EnumSet.noneOf(EnquiryResponseChannel.class);
        for (EnquiryResponseChannel channel : request.channels()) {
            if (channel == EnquiryResponseChannel.CHAT) {
                throw new ValidationException("Chat is always open and needs no agreement.");
            }
            requested.add(channel);
        }

        List<EnquiryChannelConsent> live = consentRepository.findByUserIdAndRevokedAtIsNull(userId);
        Set<EnquiryResponseChannel> already = EnumSet.noneOf(EnquiryResponseChannel.class);
        for (EnquiryChannelConsent consent : live) {
            already.add(consent.getChannel());
        }

        Set<EnquiryResponseChannel> added = EnumSet.copyOf(requested);
        added.removeAll(already);

        // The tick is load-bearing or it is theatre. Checked against what the
        // request ADDS rather than against the whole set, so a revoke-only call
        // and a no-op resend are not made to carry an agreement they are not.
        if (!added.isEmpty() && !request.agreed()) {
            throw new ValidationException("Tick the agreement to share these details.");
        }
        for (EnquiryResponseChannel channel : added) {
            if (!isUsable(channel, user)) {
                throw new ValidationException(channel == EnquiryResponseChannel.EMAIL
                        ? "Verify your email address before sharing it."
                        : "That channel is not available on your account.");
            }
        }

        for (EnquiryChannelConsent consent : live) {
            if (!requested.contains(consent.getChannel())) {
                consent.revoke();
            }
        }
        List<EnquiryChannelConsent> grants = new ArrayList<>();
        for (EnquiryResponseChannel channel : added) {
            grants.add(EnquiryChannelConsent.grant(userId, channel));
        }
        consentRepository.saveAll(grants);
        consentRepository.saveAll(live);

        log.info("Enquiry channel consent updated userId={} channels={}", userId, requested);
        return describe(user, requested);
    }

    /**
     * Withdraws one channel everywhere.
     *
     * <p>
     * The account-settings master switch. Separate from {@link #replace} because
     * it is the one operation that must not be able to grant anything by
     * accident — a switch turned off should never be a path to a new row.
     */
    @Transactional
    public EnquiryChannelConsentResponse revoke(UUID userId, EnquiryResponseChannel channel) {
        List<EnquiryChannelConsent> live = consentRepository.findByUserIdAndRevokedAtIsNull(userId);
        for (EnquiryChannelConsent consent : live) {
            if (consent.getChannel() == channel) {
                consent.revoke();
            }
        }
        consentRepository.saveAll(live);

        log.info("Enquiry channel consent revoked userId={} channel={}", userId, channel);
        return myConsents(userId);
    }

    // ---- Rules -----------------------------------------------------------

    /**
     * Whether a channel could carry a reply at all, ignoring consent.
     *
     * <p>
     * Phone is unconditional — a verified phone is a precondition of having an
     * account. Email needs an address that is present AND verified, because an
     * unverified one is an address nobody has proved they can read.
     */
    private boolean isUsable(EnquiryResponseChannel channel, UserSummaryResponse user) {
        return targetFor(channel, user) != null;
    }

    private static String targetFor(EnquiryResponseChannel channel, UserSummaryResponse user) {
        if (user == null) {
            return null;
        }
        return switch (channel) {
            case CALL_BACK -> user.phone() != null && !user.phone().isBlank() ? user.phone() : null;
            case EMAIL -> user.email() != null && !user.email().isBlank() && user.emailVerified()
                    ? user.email()
                    : null;
            case CHAT -> null;
        };
    }

    private EnquiryChannelConsentResponse describe(UserSummaryResponse user, Set<EnquiryResponseChannel> granted) {
        List<EnquiryChannelOption> options = new ArrayList<>();

        // Chat leads, locked on. It is the baseline every enquiry has rather than
        // something weighed against the others, and listing it first is what says
        // so — the choices below it are what someone adds ON TOP of being
        // reachable in the app.
        options.add(new EnquiryChannelOption(EnquiryResponseChannel.CHAT, null, true, true, true));

        boolean anyGranted = false;
        for (EnquiryResponseChannel channel : GRANTABLE) {
            String target = targetFor(channel, user);
            // A grant on a channel that has since become unusable is reported as
            // NOT granted: the email was unverified or removed after the fact,
            // and saying "granted" would promise a reply that cannot be sent.
            boolean live = granted.contains(channel) && target != null;
            anyGranted = anyGranted || live;
            options.add(new EnquiryChannelOption(channel, target, target != null, live, false));
        }

        return new EnquiryChannelConsentResponse(
                options,
                EnquiryService.emailChannelState(user),
                // Chat deliberately does not count. It needs no agreement, so
                // counting it would make every account look already-consented and
                // the modal would never open.
                anyGranted,
                EnquiryChannelConsent.CURRENT_TERMS_VERSION);
    }
}
