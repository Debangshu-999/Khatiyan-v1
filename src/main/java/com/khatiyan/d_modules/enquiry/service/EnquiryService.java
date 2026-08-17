package com.khatiyan.d_modules.enquiry.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.api.dto.EmailChannelState;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryReceiptResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryResponseView;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.ReachableChannelResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryResponseRepository;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Raising and answering enquiries.
 *
 * <p>The one rule worth stating up front: the set of channels an enquirer can be
 * reached on is computed HERE, once, by {@link #reachableChannels}. Both the
 * enquirer's confirmation dialog and the owner's respond sheet render from it,
 * and {@link #respond} validates against it. Nothing recomputes it client-side.
 */
@Slf4j
@Service
public class EnquiryService {

    private final EnquiryRepository enquiryRepository;
    private final EnquiryResponseRepository enquiryResponseRepository;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;

    public EnquiryService(
            EnquiryRepository enquiryRepository,
            EnquiryResponseRepository enquiryResponseRepository,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryResponseRepository = enquiryResponseRepository;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.notificationModule = notificationModule;
    }

    // ---- Enquirer side ---------------------------------------------------

    /**
     * Whether this person may enquire about this property, and whether they
     * already have.
     *
     * <p>Drives the profile button. Returning the reason rather than a bare
     * boolean is what lets the button say "Enquiry sent" instead of just going
     * grey for an unexplained reason.
     */
    @Transactional(readOnly = true)
    public MyEnquiryResponse myEnquiryFor(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        if (managesProperty(actorUserId, property)) {
            return MyEnquiryResponse.blocked("This is your property");
        }

        return enquiryRepository
                .findByPropertyIdAndEnquirerUserIdAndStatus(propertyId, actorUserId, EnquiryStatus.NEW)
                .map(open -> MyEnquiryResponse.alreadyAsked(open.getId(), open.askedAt()))
                .orElseGet(MyEnquiryResponse::allowed);
    }

    @Transactional
    public EnquiryReceiptResponse raise(UUID actorUserId, UUID propertyId, RaiseEnquiryRequest request) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        if (managesProperty(actorUserId, property)) {
            throw new ValidationException("You cannot enquire about a property you manage.");
        }
        // Checked here as well as by the partial unique index. The index is the
        // guarantee; this is the readable message.
        if (enquiryRepository
                .findByPropertyIdAndEnquirerUserIdAndStatus(propertyId, actorUserId, EnquiryStatus.NEW)
                .isPresent()) {
            throw new ValidationException("You already have an open enquiry with this property.");
        }

        Enquiry enquiry = enquiryRepository.save(Enquiry.raise(propertyId, actorUserId, request.message()));

        UserSummaryResponse enquirer = authModule.findById(actorUserId).orElse(null);
        notifyManagement(property, enquiry, enquirer);

        log.info(
                "Enquiry raised enquiryId={} propertyId={} enquirerUserId={}",
                enquiry.getId(), propertyId, actorUserId);

        return new EnquiryReceiptResponse(
                enquiry.getId(),
                propertyId,
                property.name(),
                enquiry.askedAt(),
                reachableChannels(enquirer),
                emailChannelState(enquirer));
    }

    // ---- Management side -------------------------------------------------

    @Transactional(readOnly = true)
    public List<EnquiryDetailResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        List<Enquiry> enquiries = enquiryRepository.findByPropertyIdOrderByCreatedAtDesc(propertyId);
        if (enquiries.isEmpty()) {
            return List.of();
        }

        // Every response, grouped — this is the action log. The query already
        // orders newest first, and groupingBy preserves encounter order, so each
        // list arrives in the order the log wants to show it.
        Map<UUID, List<EnquiryResponse>> responsesByEnquiry = enquiryResponseRepository
                .findByEnquiryIdInOrderByCreatedAtDesc(enquiries.stream().map(Enquiry::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(EnquiryResponse::getEnquiryId));

        Set<UUID> userIds = new LinkedHashSet<>(enquiries.stream().map(Enquiry::getEnquirerUserId).toList());
        responsesByEnquiry.values().stream()
                .flatMap(List::stream)
                .forEach(response -> userIds.add(response.getRespondedByUserId()));
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(userIds);

        return enquiries.stream()
                .map(enquiry -> toDetail(
                        enquiry,
                        users.get(enquiry.getEnquirerUserId()),
                        responsesByEnquiry.getOrDefault(enquiry.getId(), List.of()),
                        users))
                .toList();
    }

    @Transactional(readOnly = true)
    public long countOpenForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return enquiryRepository.countByPropertyIdAndStatus(propertyId, EnquiryStatus.NEW);
    }

    @Transactional
    public EnquiryDetailResponse respond(UUID actorUserId, UUID enquiryId, RespondToEnquiryRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        propertyModule.ensureCanManageProperty(actorUserId, enquiry.getPropertyId());

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        ensureChannelIsReachable(request.channel(), enquirer);

        enquiry.markResponded();
        enquiryResponseRepository.save(
                EnquiryResponse.of(enquiry.getId(), request.channel(), actorUserId, request.note()));

        // Re-read the whole log rather than returning just the new row: the card
        // that receives this renders the log button from it, and handing back a
        // one-entry list would make the history look like it had been erased.
        List<EnquiryResponse> responses =
                enquiryResponseRepository.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry.getId()));

        // The enquirer is told nothing in-app. Picking a channel opens the
        // owner's dialer or mail app, so the reply reaches them as a phone call
        // or an email — announcing "they replied" alongside that would be a
        // second, emptier message about a conversation happening elsewhere.
        // Revisit when chat lands: a chat reply DOES live in the app and should
        // announce itself. NotificationSubtype.ENQUIRY_ANSWERED is kept for that.

        log.info(
                "Enquiry answered enquiryId={} channel={} respondedByUserId={}",
                enquiry.getId(), request.channel(), actorUserId);

        Map<UUID, UserSummaryResponse> users = authModule.findByIds(
                responses.stream().map(EnquiryResponse::getRespondedByUserId).toList());
        return toDetail(enquiry, enquirer, responses, users);
    }

    // ---- Rules -----------------------------------------------------------

    /**
     * The channels this person can actually be reached on.
     *
     * <p>Phone is unconditional: a verified phone is a precondition of having an
     * account at all. Email is conditional on being both present and verified —
     * an unverified address is one nobody has proved they can read, and
     * promising to write to it is worse than not offering it.
     *
     * <p>CHAT is never included. It does not exist yet, and this list is the
     * definition of "reachable".
     */
    static List<ReachableChannelResponse> reachableChannels(UserSummaryResponse user) {
        List<ReachableChannelResponse> channels = new ArrayList<>();
        if (user == null) {
            return channels;
        }
        if (user.phone() != null && !user.phone().isBlank()) {
            channels.add(new ReachableChannelResponse(EnquiryResponseChannel.CALL_BACK, user.phone()));
        }
        if (user.email() != null && !user.email().isBlank() && user.emailVerified()) {
            channels.add(new ReachableChannelResponse(EnquiryResponseChannel.EMAIL, user.email()));
        }
        return channels;
    }

    /**
     * Distinguishes "no email" from "email not verified" so the enquirer is told
     * to do the one thing that is actually missing.
     */
    static EmailChannelState emailChannelState(UserSummaryResponse user) {
        if (user == null || user.email() == null || user.email().isBlank()) {
            return EmailChannelState.NOT_REGISTERED;
        }
        return user.emailVerified() ? EmailChannelState.AVAILABLE : EmailChannelState.UNVERIFIED;
    }

    private void ensureChannelIsReachable(EnquiryResponseChannel channel, UserSummaryResponse enquirer) {
        if (channel == EnquiryResponseChannel.CHAT) {
            throw new ValidationException("Chat is not available yet.");
        }
        boolean reachable = reachableChannels(enquirer).stream()
                .anyMatch(option -> option.channel() == channel);
        if (!reachable) {
            throw new ValidationException(
                    channel == EnquiryResponseChannel.EMAIL
                            ? "This person has no verified email address."
                            : "This person cannot be reached on that channel.");
        }
    }

    private boolean managesProperty(UUID actorUserId, PropertyResponse property) {
        return actorUserId.equals(property.ownerId())
                || propertyModule.findActiveManagerUserIds(property.id()).contains(actorUserId);
    }

    // ---- Plumbing --------------------------------------------------------

    private EnquiryDetailResponse toDetail(
            Enquiry enquiry,
            UserSummaryResponse enquirer,
            List<EnquiryResponse> responses,
            Map<UUID, UserSummaryResponse> users) {
        return new EnquiryDetailResponse(
                enquiry.getId(),
                enquiry.getPropertyId(),
                enquiry.getMessage(),
                enquiry.getStatus(),
                enquiry.askedAt(),
                enquiry.getEnquirerUserId(),
                enquirer != null ? enquirer.fullName() : null,
                enquirer != null ? enquirer.phone() : null,
                // Deliberately withheld unless verified, so the client cannot
                // offer an address the server would then refuse.
                enquirer != null && enquirer.emailVerified() ? enquirer.email() : null,
                reachableChannels(enquirer),
                responses.stream()
                        .map(response -> EnquiryResponseView.of(response, nameOf(users, response.getRespondedByUserId())))
                        .toList());
    }

    private void notifyManagement(PropertyResponse property, Enquiry enquiry, UserSummaryResponse enquirer) {
        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(property.ownerId());
        recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));

        String who = enquirer != null && enquirer.fullName() != null ? enquirer.fullName() : "Someone";
        notificationModule.notifyUsers(
                recipients,
                "New enquiry for " + property.name(),
                who + ": " + enquiry.getMessage(),
                NotificationCategory.ENQUIRY,
                NotificationPriority.NORMAL,
                NotificationSubtype.ENQUIRY_RECEIVED,
                enquiry.getId(),
                Map.of("enquiryId", enquiry.getId().toString(), "propertyId", property.id().toString()),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        return Optional.ofNullable(users.get(userId)).map(UserSummaryResponse::fullName).orElse(null);
    }
}
