package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryHandlerSettingsRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryHandlerSettingsResponse;
import com.khatiyan.d_modules.enquiry.event.EnquiryHandlerAssignedEvent;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerAssignment;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerSettings;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.repository.EnquiryHandlerSettingsRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryResponseRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Who handles an enquiry.
 *
 * <p>One person does, and the property's {@link EnquiryHandlerMode} says how
 * they are chosen:
 * <ul>
 * <li><b>First to respond</b> (the default, and what a property with no settings
 * row is in): nobody at first. Whoever makes the first attempt takes it.</li>
 * <li><b>System turns:</b> given on arrival, to the managers in turn, so each
 * gets an even share. The owner chooses whether they take a turn.</li>
 * <li><b>Owner assigns:</b> nobody until the owner gives it to someone.</li>
 * </ul>
 *
 * <p>In every mode the owner can act on any enquiry and can move it to someone
 * else. Once an enquiry has a handler, the other managers can read it and
 * cannot act on it.
 *
 * <p>This service holds the rule and changes the enquiry. It tells nobody:
 * notifications are {@link EnquiryService}'s, which knows the names.
 */
@Slf4j
@Service
public class EnquiryHandlerService {

    /** Written on a call nobody can settle any more, because the caller left the property. */
    static final String LEFT_BEFORE_SETTLING = "Not settled before they left the property.";

    private final EnquiryHandlerSettingsRepository settingsRepository;
    private final EnquiryRepository enquiryRepository;
    private final EnquiryResponseRepository enquiryResponseRepository;
    private final PropertyModule propertyModule;
    private final ApplicationEventPublisher eventPublisher;

    public EnquiryHandlerService(
            EnquiryHandlerSettingsRepository settingsRepository,
            EnquiryRepository enquiryRepository,
            EnquiryResponseRepository enquiryResponseRepository,
            PropertyModule propertyModule,
            ApplicationEventPublisher eventPublisher) {
        this.settingsRepository = settingsRepository;
        this.enquiryRepository = enquiryRepository;
        this.enquiryResponseRepository = enquiryResponseRepository;
        this.propertyModule = propertyModule;
        this.eventPublisher = eventPublisher;
    }

    // ---- The setting -----------------------------------------------------

    /** Readable by everyone in management: it explains why a card can or cannot be acted on. */
    @Transactional(readOnly = true)
    public EnquiryHandlerSettingsResponse settings(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return settingsRepository.findByPropertyId(propertyId)
                .map(EnquiryHandlerSettingsResponse::of)
                .orElseGet(() -> EnquiryHandlerSettingsResponse.unset(propertyId));
    }

    /**
     * The owner's first choice of a mode.
     *
     * <p>Refused as stale when a row already exists: the screen that sent this
     * loaded "never chosen", and that is no longer true.
     */
    @Transactional
    public EnquiryHandlerSettingsResponse choose(
            UUID actorUserId, UUID propertyId, EnquiryHandlerSettingsRequest request) {
        propertyModule.ensureOwner(actorUserId, propertyId);
        if (settingsRepository.findByPropertyId(propertyId).isPresent()) {
            throw new StaleVersionException();
        }

        EnquiryHandlerSettings settings;
        try {
            settings = settingsRepository.saveAndFlush(
                    EnquiryHandlerSettings.choose(propertyId, request.mode(), request.includeOwner()));
        } catch (DataIntegrityViolationException sameMoment) {
            // Two first saves at once. The unique index kept one.
            throw new StaleVersionException();
        }

        log.info("Enquiry handler mode chosen propertyId={} mode={} includeOwner={}",
                propertyId, settings.getMode(), settings.isIncludeOwner());
        return EnquiryHandlerSettingsResponse.of(settings);
    }

    /**
     * Changes the mode. Enquiries already given to someone stay with them: the
     * mode decides how the NEXT one finds its handler.
     */
    @Transactional
    public EnquiryHandlerSettingsResponse change(
            UUID actorUserId, UUID propertyId, EnquiryHandlerSettingsRequest request) {
        propertyModule.ensureOwner(actorUserId, propertyId);
        EnquiryHandlerSettings settings = settingsRepository.findByPropertyId(propertyId)
                .orElseThrow(() -> new NotFoundException("Enquiry handler settings", propertyId));
        VersionGuard.claim(settings);

        settings.change(request.mode(), request.includeOwner());
        settings = settingsRepository.saveAndFlush(settings);

        log.info("Enquiry handler mode changed propertyId={} mode={} includeOwner={}",
                propertyId, settings.getMode(), settings.isIncludeOwner());
        return EnquiryHandlerSettingsResponse.of(settings);
    }

    @Transactional(readOnly = true)
    public EnquiryHandlerMode modeOf(UUID propertyId) {
        return settingsRepository.findByPropertyId(propertyId)
                .map(EnquiryHandlerSettings::getMode)
                .orElse(EnquiryHandlerMode.FIRST_RESPONSE);
    }

    // ---- The rule --------------------------------------------------------

    /**
     * Whether someone in the property's management may act on an enquiry.
     *
     * <p>The caller has already established that they are in management. This
     * only decides between the people who are.
     */
    static boolean mayAct(UUID actorUserId, Enquiry enquiry, UUID ownerUserId, EnquiryHandlerMode mode) {
        if (actorUserId.equals(ownerUserId)) {
            return true;
        }
        if (enquiry.hasHandler()) {
            return enquiry.isHandledBy(actorUserId);
        }
        // Nobody has it yet. Open to all, unless the owner is the one who decides.
        return mode != EnquiryHandlerMode.OWNER_ASSIGNS;
    }

    void ensureMayAct(UUID actorUserId, Enquiry enquiry, UUID ownerUserId, EnquiryHandlerMode mode) {
        if (mayAct(actorUserId, enquiry, ownerUserId, mode)) {
            return;
        }
        throw new ValidationException(enquiry.hasHandler()
                ? "Someone else is handling this enquiry."
                : "The owner assigns enquiries on this property. Ask them to give you this one.");
    }

    // ---- Giving it to someone --------------------------------------------

    /**
     * Gives a just-raised enquiry its handler when the system takes turns.
     *
     * <p>The settings row is locked for the rest of the transaction. Two
     * enquiries arriving together would otherwise read the same last turn and
     * both go to the same manager.
     *
     * @return the property's mode, so the caller knows whom to tell
     */
    @Transactional
    public EnquiryHandlerMode assignOnArrival(Enquiry enquiry, PropertyResponse property, Instant now) {
        Optional<EnquiryHandlerSettings> found = settingsRepository.findByPropertyIdForUpdate(property.id());
        if (found.isEmpty()) {
            return EnquiryHandlerMode.FIRST_RESPONSE;
        }
        EnquiryHandlerSettings settings = found.get();
        if (settings.getMode() != EnquiryHandlerMode.SYSTEM_TURNS) {
            return settings.getMode();
        }

        UUID handler = settings.takeNextTurn(turnOrder(property, settings.isIncludeOwner()));
        give(enquiry, handler, EnquiryHandlerAssignment.SYSTEM, null, now);
        return settings.getMode();
    }

    /**
     * Who takes turns, in the fixed order turns are taken in.
     *
     * <p>The managers, and the owner when the owner opted in. With no managers
     * at all the owner takes every turn: an enquiry the system assigns must not
     * end up with nobody.
     */
    private List<UUID> turnOrder(PropertyResponse property, boolean includeOwner) {
        TreeSet<UUID> inOrder = new TreeSet<>(propertyModule.findActiveManagerUserIds(property.id()));
        if (includeOwner || inOrder.isEmpty()) {
            inOrder.add(property.ownerId());
        }
        return new ArrayList<>(inOrder);
    }

    /**
     * The first attempt on an enquiry nobody handles makes its author the
     * handler, whether or not the attempt succeeds.
     *
     * @return true when the actor took it, false when it already had a handler
     */
    boolean takeOnFirstAttempt(
            Enquiry enquiry, UUID actorUserId, UUID ownerUserId, EnquiryHandlerMode mode, Instant now) {
        if (enquiry.hasHandler()) {
            return false;
        }
        // In owner-assigns mode only the owner gets this far, and acting on it
        // themselves is the owner assigning it to themselves.
        boolean ownerAssigning = mode == EnquiryHandlerMode.OWNER_ASSIGNS && actorUserId.equals(ownerUserId);
        give(enquiry,
                actorUserId,
                ownerAssigning ? EnquiryHandlerAssignment.OWNER : EnquiryHandlerAssignment.FIRST_RESPONSE,
                ownerAssigning ? actorUserId : null,
                now);
        return true;
    }

    /** The owner gives an enquiry to themselves or a manager, for the first time or again. */
    void assignByOwner(Enquiry enquiry, UUID handlerUserId, UUID ownerUserId, Instant now) {
        give(enquiry, handlerUserId, EnquiryHandlerAssignment.OWNER, ownerUserId, now);
    }

    private void give(Enquiry enquiry, UUID handlerUserId, EnquiryHandlerAssignment how, UUID byUserId, Instant now) {
        enquiry.assignHandler(handlerUserId, how, byUserId, now);
        eventPublisher.publishEvent(new EnquiryHandlerAssignedEvent(
                enquiry.getId(), enquiry.getPropertyId(), enquiry.getEnquirerUserId(), handlerUserId, how));
        log.info("Enquiry handler set enquiryId={} handlerUserId={} assignedBy={}",
                enquiry.getId(), handlerUserId, how);
    }

    // ---- A manager leaves ------------------------------------------------

    /**
     * Returns a departed manager's enquiries to the owner.
     *
     * <p>Their unsettled calls are closed as failed. Nobody else was on the
     * call, so nobody left can say how it went, and an open call would block
     * the owner from calling. Their unanswered chats stay open: the enquirer
     * can still reply on the thread, and that reply still counts.
     *
     * <p>Safe to run twice. The second run finds nothing in their name.
     *
     * @return how many enquiries came back to the owner
     */
    @Transactional
    public int returnToOwner(UUID propertyId, UUID managerUserId, UUID ownerUserId) {
        Instant now = Instant.now();

        for (EnquiryResponse call : enquiryResponseRepository.findOpenByUserOnProperty(
                managerUserId, propertyId, EnquiryResponseChannel.CALL_BACK)) {
            call.settle(EnquiryAttemptOutcome.FAILED, LEFT_BEFORE_SETTLING, now);
        }

        List<Enquiry> theirs = enquiryRepository.findLiveHandledBy(propertyId, managerUserId, now);
        for (Enquiry enquiry : theirs) {
            give(enquiry, ownerUserId, EnquiryHandlerAssignment.SYSTEM, null, now);
        }

        if (!theirs.isEmpty()) {
            log.info("Enquiries returned to the owner propertyId={} fromManagerUserId={} count={}",
                    propertyId, managerUserId, theirs.size());
        }
        return theirs.size();
    }
}
