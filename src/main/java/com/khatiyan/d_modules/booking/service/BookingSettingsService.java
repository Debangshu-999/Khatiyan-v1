package com.khatiyan.d_modules.booking.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.api.dto.BookingSettingsResponse;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.d_modules.booking.model.BookingSettings;
import com.khatiyan.d_modules.booking.repository.BookingSettingsRepository;
import com.khatiyan.d_modules.property.PropertyModule;

import lombok.extern.slf4j.Slf4j;

/**
 * The owner's booking settings. Only the owner reads or changes them.
 *
 * <p>A property takes booking requests once these are saved, and not before:
 * the tenant is shown the token and its refund answer before they ask.
 */
@Slf4j
@Service
public class BookingSettingsService {

    private final BookingSettingsRepository settingsRepository;
    private final PropertyModule properties;

    public BookingSettingsService(BookingSettingsRepository settingsRepository, PropertyModule properties) {
        this.settingsRepository = settingsRepository;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public BookingSettingsResponse forOwner(UUID ownerUserId, UUID propertyId) {
        properties.ensureOwner(ownerUserId, propertyId);
        return settingsRepository.findById(propertyId)
                .map(BookingSettingsResponse::of)
                .orElseGet(() -> BookingSettingsResponse.notConfigured(propertyId));
    }

    /** The first save. Refused as stale if someone else set them up since the screen loaded. */
    @Transactional
    public BookingSettingsResponse create(UUID ownerUserId, UUID propertyId, SaveBookingSettingsRequest request) {
        properties.ensureOwner(ownerUserId, propertyId);
        properties.getActiveProperty(propertyId);
        if (settingsRepository.existsById(propertyId)) {
            throw new StaleVersionException();
        }
        BookingSettings settings = BookingSettings.forProperty(propertyId);
        apply(settings, request, ownerUserId);
        try {
            settings = settingsRepository.saveAndFlush(settings);
        } catch (DataIntegrityViolationException raced) {
            // Two first saves at the same moment: one row per property lets
            // one in, and the other is told to refresh.
            throw new StaleVersionException();
        }
        log.info("Booking settings set up propertyId={} actorUserId={} tokenRequired={} maximumAdvanceDays={}",
                propertyId, ownerUserId, settings.isTokenRequired(), settings.getMaximumAdvanceDays());
        return BookingSettingsResponse.of(settings);
    }

    /** A change. Needs the version the screen loaded. Requests already sent keep what they were shown. */
    @Transactional
    public BookingSettingsResponse save(UUID ownerUserId, UUID propertyId, SaveBookingSettingsRequest request) {
        properties.ensureOwner(ownerUserId, propertyId);
        BookingSettings settings = settingsRepository.findById(propertyId)
                .orElseThrow(() -> new ValidationException("Set up bookings for this property first."));
        VersionGuard.claim(settings);
        apply(settings, request, ownerUserId);
        settings = settingsRepository.saveAndFlush(settings);
        log.info("Booking settings saved propertyId={} actorUserId={} tokenRequired={} maximumAdvanceDays={}",
                propertyId, ownerUserId, settings.isTokenRequired(), settings.getMaximumAdvanceDays());
        return BookingSettingsResponse.of(settings);
    }

    /** For this module's own writes. Empty until the owner has set bookings up. */
    @Transactional(readOnly = true)
    public Optional<BookingSettings> find(UUID propertyId) {
        return settingsRepository.findById(propertyId);
    }

    private static void apply(BookingSettings settings, SaveBookingSettingsRequest request, UUID byUserId) {
        if (request.tokenRequired() == null || request.showFutureVacancies() == null) {
            throw new ValidationException("Fill in every booking setting.");
        }
        settings.apply(request.tokenRequired(), request.tokenAmountPaise(), request.tokenRefundable(),
                fixedWindow(request.maximumAdvanceDays()), request.showFutureVacancies(), request.assignmentMode(),
                request.includeOwnerInTurns(), byUserId);
    }

    /**
     * How far ahead a tenant may book is not the owner's to set (user,
     * 2026-10-10). A request asks for a day 3 to 21 days ahead, and a
     * confirmed date moves once, by a week at most, so 28 days is the furthest
     * a booking ever reaches. Booking further ahead waits for the advance-rent
     * rule, which is not built.
     *
     * <p>The number is still stored, because that rule will raise it. Nothing
     * here lets an owner raise it. A caller that sends another number is
     * refused, never quietly corrected.
     */
    private static int fixedWindow(Integer requested) {
        if (requested != null && requested != BookingPolicy.DEFAULT_MAXIMUM_MOVE_IN_DAYS) {
            throw new ValidationException("Move-in dates are fixed at " + BookingPolicy.MINIMUM_MOVE_IN_DAYS + " to "
                    + BookingPolicy.DEFAULT_MAXIMUM_MOVE_IN_DAYS + " days ahead. This cannot be changed.");
        }
        return BookingPolicy.DEFAULT_MAXIMUM_MOVE_IN_DAYS;
    }
}
