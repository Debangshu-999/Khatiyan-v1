package com.khatiyan.d_modules.notification.listener;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.booking.event.BookedBedNotFreeEvent;
import com.khatiyan.d_modules.booking.event.BookingPropertyToldEvent;
import com.khatiyan.d_modules.booking.event.BookingTenantToldEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;

/**
 * Notifications that come from post-visit bookings.
 *
 * <p>Who is told is decided by the booking module and carried on the event:
 * the owner and the managers on the bookings access list, never a manager
 * merely because they manage the property.
 */
@Component
public class BookingNotificationEventListener {

    private final NotificationModule notificationModule;
    private final PropertyModule propertyModule;

    public BookingNotificationEventListener(NotificationModule notificationModule, PropertyModule propertyModule) {
        this.notificationModule = notificationModule;
        this.propertyModule = propertyModule;
    }

    /**
     * A booked bed must be freed for a booking to start (user's wording,
     * 2026-10-10). It names the booking that is waiting, because the stay in
     * the way already has its own notification when it is past its checkout
     * date.
     */
    @ApplicationModuleListener
    public void onBookedBedNotFree(BookedBedNotFreeEvent event) {
        if (event.recipientUserIds().isEmpty()) {
            return;
        }
        String propertyName = propertyModule.getActiveProperty(event.propertyId()).name();
        Map<String, String> data = new LinkedHashMap<>();
        data.put("bookingRequestId", event.requestId().toString());
        data.put("bookingReferenceCode", event.referenceCode());
        data.put("propertyId", event.propertyId().toString());
        data.put("propertyName", propertyName);
        data.put("roomId", event.roomId().toString());
        data.put("roomNumber", event.roomNumber());
        data.put("moveInDate", event.moveInDate().toString());

        String bed = "The bed in Room " + event.roomNumber() + " at " + propertyName;
        String booking = event.tenantName() + "'s booking " + event.referenceCode();
        boolean firstDay = event.today().equals(event.moveInDate());
        String body = firstDay
                ? bed + " needs to be freed today to start " + booking + "."
                : bed + " is still occupied. " + booking + " was to start on " + event.moveInDate()
                        + ". Free the bed so they can move in.";

        notificationModule.notifyUsers(
                event.recipientUserIds(),
                firstDay ? "Free a bed today" : "A booked bed is still occupied",
                body,
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.BOOKED_BED_NOT_FREE,
                event.requestId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }

    /**
     * The tenant's own booking: confirmed, the date moved, move-in tomorrow,
     * cancelled, expired, or the bed not free on the day (2026-10-18). The
     * booking module chose the words and made sure it is said once.
     */
    @ApplicationModuleListener
    public void onBookingTenantTold(BookingTenantToldEvent event) {
        NotificationSubtype subtype = NotificationSubtype.valueOf("BOOKING_" + event.kind());
        boolean urgent = subtype == NotificationSubtype.BOOKING_BED_NOT_READY
                || subtype == NotificationSubtype.BOOKING_CANCELLED;
        notificationModule.notifyUser(
                event.tenantUserId(),
                event.title(),
                event.body(),
                NotificationCategory.TENANCY,
                urgent ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
                subtype,
                event.requestId(),
                new LinkedHashMap<>(event.data()),
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.TENANT);
    }

    /** A reminder to the property about a booking (2026-10-19). The booking module chose who is told. */
    @ApplicationModuleListener
    public void onBookingPropertyTold(BookingPropertyToldEvent event) {
        if (event.recipientUserIds().isEmpty()) {
            return;
        }
        notificationModule.notifyUsers(
                event.recipientUserIds(),
                event.title(),
                event.body(),
                NotificationCategory.TENANCY,
                NotificationPriority.HIGH,
                NotificationSubtype.valueOf("BOOKING_" + event.kind()),
                event.requestId(),
                new LinkedHashMap<>(event.data()),
                NotificationDeliveryMode.IN_APP_AND_PUSH,
                NotificationAudience.MANAGEMENT);
    }
}
