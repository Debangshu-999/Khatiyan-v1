package com.khatiyan.d_modules.enquiry.service;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.time.Instant;
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
import com.khatiyan.d_modules.chat.ChatModule;
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
 *
 * <p>That rule now has two halves. Whether a channel <em>works</em> is a fact
 * about the account and lives here. Whether the enquirer <em>agreed</em> to it
 * is decided by {@link EnquiryChannelConsentService}. A channel needs both, and
 * nothing downstream is allowed to see one without the other — which is why the
 * enquirer's phone and email are withheld from management exactly when the
 * matching consent is missing.
 *
 * <p><b>The consent half is read once, at {@link #raise}, and frozen onto the
 * enquiry.</b> Every later read — the list, the respond sheet, the validation on
 * answering — uses {@code Enquiry.sharedChannels} rather than asking the consent
 * table again. Changing the standing decision therefore governs the next
 * enquiry and leaves earlier ones exactly as they were asked, instead of
 * reshaping a conversation already underway.
 */
@Slf4j
@Service
public class EnquiryService {

    private final EnquiryRepository enquiryRepository;
    private final EnquiryResponseRepository enquiryResponseRepository;
    private final EnquiryChannelConsentService consentService;
    private final ChatModule chatModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;

    public EnquiryService(
            EnquiryRepository enquiryRepository,
            EnquiryResponseRepository enquiryResponseRepository,
            EnquiryChannelConsentService consentService,
            ChatModule chatModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryResponseRepository = enquiryResponseRepository;
        this.consentService = consentService;
        this.chatModule = chatModule;
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

        UserSummaryResponse enquirer = authModule.findById(actorUserId).orElse(null);

        // The standing decision is read exactly ONCE, here, and then frozen onto
        // the enquiry. Everything downstream reads the snapshot, so changing the
        // setting later governs the next enquiry and leaves this one as asked.
        List<ReachableChannelResponse> reachable =
                reachableChannels(enquirer, consentService.liveChannels(actorUserId));

        // No "nothing is reachable" guard any more. It existed because an
        // enquiry with phone and email both declined was one nobody could ever
        // answer, and it would have sat in the property's queue with no way to
        // clear it. Chat removed that: every enquiry now carries a reply path
        // that needs no contact details at all, so declining both is a complete
        // and answerable choice rather than a dead end.

        Set<EnquiryResponseChannel> shared = reachable.stream()
                .map(ReachableChannelResponse::channel)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(EnquiryResponseChannel.class)));

        Enquiry enquiry = enquiryRepository.save(
                Enquiry.raise(propertyId, actorUserId, request.message(), shared));

        notifyManagement(property, enquiry, enquirer);

        log.info(
                "Enquiry raised enquiryId={} propertyId={} enquirerUserId={}",
                enquiry.getId(), propertyId, actorUserId);

        return new EnquiryReceiptResponse(
                enquiry.getId(),
                propertyId,
                property.name(),
                enquiry.askedAt(),
                reachable,
                emailChannelState(enquirer));
    }

    // ---- Management side -------------------------------------------------

    @Transactional(readOnly = true)
    public List<EnquiryDetailResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        List<Enquiry> enquiries = enquiryRepository.findVisibleForProperty(propertyId, Instant.now());
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

        // No consent lookup here any more. Each enquiry carries the set it was
        // raised with, which is both the correct answer and one fewer query per
        // page than asking the consent table for every enquirer on it.
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
        return enquiryRepository.countAwaitingAnswer(propertyId, Instant.now());
    }

    @Transactional
    public EnquiryDetailResponse respond(UUID actorUserId, UUID enquiryId, RespondToEnquiryRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        propertyModule.ensureCanManageProperty(actorUserId, enquiry.getPropertyId());

        // Refused server-side as well as greyed out in the UI. The card can be
        // stale — it was rendered before the sweep ran — and an expired enquiry
        // is one the enquirer has been freed to re-raise, so answering it now
        // would be answering a question that has already been withdrawn.
        if (enquiry.isExpired()) {
            throw new ValidationException("This enquiry has expired. The enquirer can raise a new one.");
        }

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        // The snapshot, not today's setting. What the property was told it could
        // use when the question arrived is what it may use to answer it.
        ensureChannelIsReachable(request.channel(), enquirer, enquiry.getSharedChannels());

        // Chat first, and inside this transaction: the enquiry must not be
        // recorded as answered-by-chat unless the conversation the answer lives
        // in actually exists. Idempotent on the enquiry id, so a second manager
        // answering the same way joins the same thread.
        if (request.channel() == EnquiryResponseChannel.CHAT) {
            enquiry.attachChatThread(chatModule.openEnquiryThread(
                    enquiry.getPropertyId(), enquiry.getId(), enquiry.getEnquirerUserId(), actorUserId));
        }

        enquiry.markResponded();
        enquiryResponseRepository.save(
                EnquiryResponse.of(enquiry.getId(), request.channel(), actorUserId, request.note()));

        // Re-read the whole log rather than returning just the new row: the card
        // that receives this renders the log button from it, and handing back a
        // one-entry list would make the history look like it had been erased.
        List<EnquiryResponse> responses =
                enquiryResponseRepository.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry.getId()));

        // Told for chat, and ONLY for chat. Picking phone or email opens the
        // responder's dialer or mail app, so the reply arrives as a call or a
        // message and "they replied" alongside it would be a second, emptier
        // notice about something happening elsewhere. A chat reply is different:
        // it lands inside this app, on a screen the enquirer has no reason to be
        // looking at, and without this nothing would ever point them at it.
        if (request.channel() == EnquiryResponseChannel.CHAT) {
            notifyEnquirerOfChat(enquiry, actorUserId);
        }


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
     * <p>Two conditions, both required. The channel has to <em>work</em>: a
     * verified phone is a precondition of having an account, while email needs
     * an address that is present and verified, because an unverified one is an
     * address nobody has proved they can read. And the enquirer has to have
     * <em>agreed</em> to it — a working number they never offered is not a
     * channel, it is a detail nobody asked to hand over.
     *
     * <p>Management is shown only what comes out of here. Not the closed
     * channels greyed out with an explanation: a channel someone declined is not
     * management's business, and showing it invites working around it.
     *
     * <p>CHAT is never included. It does not exist yet, and this list is the
     * definition of "reachable".
     */
    static List<ReachableChannelResponse> reachableChannels(
            UserSummaryResponse user,
            Set<EnquiryResponseChannel> consented) {
        List<ReachableChannelResponse> channels = new ArrayList<>();
        if (user == null) {
            return channels;
        }
        if (consented.contains(EnquiryResponseChannel.CALL_BACK)
                && user.phone() != null && !user.phone().isBlank()) {
            channels.add(new ReachableChannelResponse(EnquiryResponseChannel.CALL_BACK, user.phone()));
        }
        if (consented.contains(EnquiryResponseChannel.EMAIL)
                && user.email() != null && !user.email().isBlank() && user.emailVerified()) {
            channels.add(new ReachableChannelResponse(EnquiryResponseChannel.EMAIL, user.email()));
        }
        // Always, and with no value beside it. Chat is the one channel that
        // hands the responder nothing they could keep: a number can be saved and
        // reused past anything this app can revoke, a conversation cannot. That
        // is why it needs no consent to appear and why it is never stored as
        // one — there is nothing to agree to and nothing to withdraw.
        channels.add(new ReachableChannelResponse(EnquiryResponseChannel.CHAT, null));
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

    private void ensureChannelIsReachable(
            EnquiryResponseChannel channel,
            UserSummaryResponse enquirer,
            Set<EnquiryResponseChannel> consented) {
        // Never refused, and deliberately ahead of the snapshot check. The
        // frozen set holds what the enquirer SHARED, and chat shares nothing —
        // so it is absent from every enquiry raised before this landed, and
        // asking the snapshot about it would refuse the one channel that has no
        // consent to be missing.
        if (channel == EnquiryResponseChannel.CHAT) {
            return;
        }
        boolean reachable = reachableChannels(enquirer, consented).stream()
                .anyMatch(option -> option.channel() == channel);
        if (!reachable) {
            // One message for both halves of the rule on purpose. Telling a
            // responder WHICH condition failed would tell them the enquirer
            // declined this channel, and that is a fact about the enquirer that
            // the responder has no claim on.
            throw new ValidationException("This person cannot be reached on that channel.");
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
        // Both contact details are read off the reachable list rather than off
        // the user, so there is exactly one place where "may management see
        // this" is decided. Phone used to be sent unconditionally, which is how
        // a responder ended up keeping a number the enquirer never offered.
        List<ReachableChannelResponse> reachable = reachableChannels(enquirer, enquiry.getSharedChannels());

        return new EnquiryDetailResponse(
                enquiry.getId(),
                enquiry.getPropertyId(),
                enquiry.getMessage(),
                enquiry.getStatus(),
                enquiry.askedAt(),
                enquiry.getExpiresAt(),
                enquiry.getEnquirerUserId(),
                enquirer != null ? enquirer.fullName() : null,
                targetOf(reachable, EnquiryResponseChannel.CALL_BACK),
                targetOf(reachable, EnquiryResponseChannel.EMAIL),
                reachable,
                enquiry.getChatThreadId(),
                responses.stream()
                        .map(response -> EnquiryResponseView.of(response, nameOf(users, response.getRespondedByUserId())))
                        .toList());
    }

    private static String targetOf(List<ReachableChannelResponse> reachable, EnquiryResponseChannel channel) {
        return reachable.stream()
                .filter(option -> option.channel() == channel)
                .map(ReachableChannelResponse::target)
                .findFirst()
                .orElse(null);
    }

    /**
     * Points the enquirer at the conversation somebody just opened for them.
     *
     * <p>To the enquirer alone. The responder is standing in the thread they
     * created, and management already has the enquiry in its own queue.
     */
    private void notifyEnquirerOfChat(Enquiry enquiry, UUID responderUserId) {
        PropertyResponse property = propertyModule.getActiveProperty(enquiry.getPropertyId());

        Map<String, String> data = new LinkedHashMap<>();
        data.put("enquiryId", enquiry.getId().toString());
        data.put("propertyId", property.id().toString());
        data.put("propertyName", property.name());
        if (enquiry.getChatThreadId() != null) {
            data.put("threadId", enquiry.getChatThreadId().toString());
        }

        notificationModule.notifyUser(
                enquiry.getEnquirerUserId(),
                property.name() + " replied",
                "Your enquiry has been answered in chat.",
                NotificationCategory.ENQUIRY,
                NotificationPriority.HIGH,
                NotificationSubtype.ENQUIRY_ANSWERED,
                enquiry.getId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);

        log.info(
                "Enquiry chat reply announced enquiryId={} responderUserId={}",
                enquiry.getId(), responderUserId);
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
