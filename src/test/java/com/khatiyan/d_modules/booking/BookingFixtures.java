package com.khatiyan.d_modules.booking;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.analytics.AnalyticsFixtures;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.enquiry.PostVisitBookingWindow;
import com.khatiyan.support.PublishedEvents;

/**
 * Real rows for the booking suites: properties, rooms, people, and enquiries
 * that already carry an attended visit.
 *
 * <p>The attended visit is written straight onto the enquiry, as the visit day
 * leaves it. How it gets there is the visit suites' business, not these.
 */
public final class BookingFixtures {

    private final JdbcTemplate jdbc;
    private final AnalyticsFixtures fx;
    private final List<UUID> properties = new ArrayList<>();
    private final List<UUID> people = new ArrayList<>();

    public BookingFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.fx = new AnalyticsFixtures(jdbc);
    }

    public UUID property() {
        UUID property = fx.property(Instant.now());
        properties.add(property);
        return property;
    }

    public UUID ownerOf(UUID property) {
        return jdbc.queryForObject("SELECT owner_id FROM property.properties WHERE id = ?", UUID.class, property);
    }

    /** A room listed at Rs 8,000 a month. */
    public UUID room(UUID property, int capacity, int occupied) {
        String status = occupied == 0 ? "VACANT" : occupied >= capacity ? "OCCUPIED" : "PARTIALLY_OCCUPIED";
        return fx.room(property, capacity, occupied, 0, status, true);
    }

    /**
     * How this property takes money: cash always, UPI when asked, and whether
     * cash needs the payer's code. A property with no row takes cash alone
     * and asks for no code.
     */
    public void paymentDetails(UUID property, boolean upi, boolean cashCodeRequired) {
        jdbc.update("""
                INSERT INTO billing.property_payment_details (property_id, upi_vpa, payee_name, updated_by_user_id,
                    accepts_upi, accepts_cash, cash_otp_required, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, true, ?, now(), now())
                """, property, upi ? "sunrise@upi" : null, upi ? "Sunrise PG" : null, ownerOf(property), upi,
                cashCodeRequired);
    }

    /**
     * Gives the property's booking tokens a bank account of their own, apart
     * from where its bills are paid. Needs {@link #paymentDetails} first.
     */
    public void tokenBankDetails(UUID property, String accountNumber, String ifsc, String holder) {
        jdbc.update("""
                UPDATE billing.property_payment_details
                SET token_uses_bill_details = false, token_bank_account_number = ?, token_bank_ifsc = ?,
                    token_bank_account_holder = ?
                WHERE property_id = ?
                """, accountNumber, ifsc, holder, property);
    }

    public String phoneOf(UUID person) {
        return jdbc.queryForObject("SELECT phone FROM auth.users WHERE id = ?", String.class, person);
    }

    /**
     * A real account for the property's owner, complete enough to be named as
     * the Landlord on an agreement: a full name, a verified email address and
     * a permanent address. The property fixture gives its owner an id and no
     * account, which is all the booking rules need and not enough to onboard.
     */
    public UUID ownerAccount(UUID property) {
        UUID owner = ownerOf(property);
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, email, is_email_verified, permanent_address,
                    permanent_address_pincode, created_at, updated_at)
                VALUES (?, ?, 'Meera Sen', 'OWNER', true, true, 0, 'FEMALE', DATE '1980-01-01', ?, true,
                    '12 Lake Road, Kolkata', '700029', now(), now())
                """, owner, "+9195" + String.format("%08d", (long) (Math.random() * 100_000_000L)),
                "owner-" + owner + "@example.com");
        people.add(owner);
        return owner;
    }

    /**
     * Someone with an ordinary app account, as a real visitor has. Onboarding
     * takes only these: it refuses the tenant-role accounts the older fixtures
     * make.
     */
    public UUID appUser() {
        UUID person = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, 'Asha Rao', 'USER', true, true, 0, 'FEMALE', DATE '2000-01-01', now(), now())
                """, person, "+9194" + String.format("%08d", (long) (Math.random() * 100_000_000L)));
        people.add(person);
        return person;
    }

    /** One of the ordinary manager grants, at MANAGE. */
    public void grant(UUID property, UUID manager, String resource) {
        jdbc.update("""
                INSERT INTO property.manager_permissions (id, property_id, manager_user_id, resource, access_level,
                    granted_by_user_id, granted_at)
                VALUES (?, ?, ?, ?, 'MANAGE', ?, now())
                """, UUID.randomUUID(), property, manager, resource, ownerOf(property));
    }

    /** A woman born in 2000, with an account. */
    public UUID person() {
        UUID person = fx.user("FEMALE", LocalDate.of(2000, 1, 1));
        people.add(person);
        return person;
    }

    /** A manager of this property, with an account. On no access list until granted. */
    public UUID manager(UUID property, String name) {
        UUID manager = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                    credential_version, gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, 'USER', true, true, 0, 'MALE', DATE '1990-01-01', now(), now())
                """, manager, "+9196" + String.format("%08d", (long) (Math.random() * 100_000_000L)), name);
        jdbc.update("""
                INSERT INTO property.property_managers (id, property_id, manager_user_id, assigned_by_user_id,
                    is_active, reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, ?, now(), now())
                """, UUID.randomUUID(), property, manager, ownerOf(property),
                "MGR-B-" + manager.toString().substring(0, 12));
        people.add(manager);
        return manager;
    }

    /** As the bookings access list writes it: the ordinary grant, at MANAGE. */
    public void grantBookings(UUID property, UUID manager) {
        jdbc.update("""
                INSERT INTO property.manager_permissions (id, property_id, manager_user_id, resource, access_level,
                    granted_by_user_id, granted_at)
                VALUES (?, ?, ?, 'BOOKINGS', 'MANAGE', ?, now())
                """, UUID.randomUUID(), property, manager, ownerOf(property));
    }

    /**
     * Makes this person the booking's handler, as their first answer to it
     * leaves the row. For a suite about something else that needs a handler
     * in place: how one comes to be is the assignment suite's business.
     */
    public void assign(UUID request, UUID handler) {
        jdbc.update("UPDATE booking.requests SET handler_user_id = ?, handler_assigned_by = 'FIRST_VIEW',"
                + " handler_assigned_at = now() WHERE id = ?", handler, request);
    }

    /** Taken off the access list. Nothing tells the booking module. */
    public void revokeBookings(UUID property, UUID manager) {
        jdbc.update("DELETE FROM property.manager_permissions WHERE property_id = ? AND manager_user_id = ?"
                + " AND resource = 'BOOKINGS'", property, manager);
    }

    /** As removing a manager leaves the property's own tables: no longer active, grants gone. */
    public void leave(UUID property, UUID manager) {
        jdbc.update("UPDATE property.property_managers SET is_active = false WHERE property_id = ?"
                + " AND manager_user_id = ?", property, manager);
        jdbc.update("DELETE FROM property.manager_permissions WHERE property_id = ? AND manager_user_id = ?",
                property, manager);
    }

    /** An enquiry whose visit was attended on this day, so its 30 days run from it. */
    public UUID attendedEnquiry(UUID property, UUID person, LocalDate visitedOn) {
        UUID enquiry = enquiry(property, person);
        Instant windowEnds = PostVisitBookingWindow.expiresAt(visitedOn);
        jdbc.update("""
                UPDATE enquiry.enquiries
                SET booking_visit_id = ?, booking_visit_date = ?, pre_visit_expires_at = expires_at, expires_at = ?
                WHERE id = ?
                """, UUID.randomUUID(), visitedOn, Timestamp.from(windowEnds), enquiry);
        return enquiry;
    }

    /** An enquiry nobody has visited on. */
    public UUID enquiry(UUID property, UUID person) {
        UUID enquiry = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO enquiry.enquiries (id, property_id, enquirer_user_id, message, status, expires_at,
                    handler_user_id, handler_assigned_by, handler_assigned_at, created_at, updated_at)
                VALUES (?, ?, ?, 'Is a bed free?', 'NEW', now() + INTERVAL '20 days',
                    ?, 'FIRST_RESPONSE', now(), now(), now())
                """, enquiry, property, person, ownerOf(property));
        return enquiry;
    }

    public UUID visitOf(UUID enquiry) {
        return jdbc.queryForObject("SELECT booking_visit_id FROM enquiry.enquiries WHERE id = ?", UUID.class, enquiry);
    }

    /**
     * Someone on notice in this room, whose exit was approved long enough ago
     * that it can no longer be withdrawn. The bed they leave is bookable.
     *
     * @return the approved exit
     */
    public UUID approvedExit(UUID property, UUID room, LocalDate checkout) {
        jdbc.update("""
                UPDATE property.rooms
                SET occupied_count = occupied_count + 1,
                    status = CASE WHEN occupied_count + 1 >= capacity THEN 'OCCUPIED' ELSE 'PARTIALLY_OCCUPIED' END
                WHERE id = ?
                """, room);
        UUID stay = fx.monthlyStay(property, room, "ON_NOTICE", checkout.minusMonths(3), checkout);
        UUID tenant = jdbc.queryForObject("SELECT user_id FROM tenancy.tenancies WHERE id = ?", UUID.class, stay);
        UUID exit = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenancy.tenancy_exit_requests
                (id, tenancy_id, tenant_user_id, property_id, room_id, type, status,
                 requested_checkout_date, approved_checkout_date, notice_anchor_date, decided_at,
                 reference_code, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'NORMAL_NOTICE', 'APPROVED', ?, ?, ?, ?, ?, now(), now())
                """, exit, stay, tenant, property, room, checkout, checkout, checkout.minusDays(30),
                Timestamp.from(Instant.now().minus(5, ChronoUnit.DAYS)),
                "EXIT-" + exit.toString().replace("-", ""));
        return exit;
    }

    /** A stay for a known person, at any property. */
    public UUID stay(UUID property, UUID room, UUID person, String status, LocalDate endDate) {
        return fx.monthlyStayFor(property, room, person, status, LocalDate.now().minusMonths(2), endDate);
    }

    /** What a tenant sends, asking at the listed rent for an indefinite agreement. */
    public static CreateBookingRequest ask(UUID enquiry, UUID room, LocalDate moveInDate) {
        return ask(enquiry, room, null, moveInDate, UUID.randomUUID().toString());
    }

    /**
     * A request that proposes a rent of its own. One made at the listed rent
     * leaves the property nothing to counter, so a test of bargaining starts
     * from one of these.
     */
    public static CreateBookingRequest askAt(UUID enquiry, UUID room, LocalDate moveInDate, long proposedRentPaise) {
        return new CreateBookingRequest(enquiry, room, null, moveInDate, proposedRentPaise, null,
                "Asha Rao", "9007433360", "asha@example.com", Gender.FEMALE, LocalDate.of(2000, 1, 1),
                UUID.randomUUID().toString());
    }

    public static CreateBookingRequest ask(UUID enquiry, UUID room, UUID exit, LocalDate moveInDate, String key) {
        return new CreateBookingRequest(enquiry, room, exit, moveInDate, null, null,
                "Asha Rao", "9007433360", "asha@example.com", Gender.FEMALE, LocalDate.of(2000, 1, 1), key);
    }

    public void remove() {
        for (UUID property : properties) {
            // Every booking change prompts its lead, on another thread. Let that finish first, or the lead it
            // writes outlives the property it was for.
            PublishedEvents.awaitHandled(jdbc, "LeadBookingEventListener", property);
            PublishedEvents.awaitHandled(jdbc, "LeadEnquiryEventListener", property);
            // And the tenant's own notices, which read the booking and then tell the notification module.
            PublishedEvents.awaitHandled(jdbc, "BookingTenantNotices", property);
            PublishedEvents.awaitHandled(jdbc, "BookingNotificationEventListener", property);
            jdbc.update("DELETE FROM lead.leads WHERE property_id = ?", property);
            jdbc.update("DELETE FROM booking.requests WHERE property_id = ?", property);
            jdbc.update("DELETE FROM booking.settings WHERE property_id = ?", property);
            jdbc.update("DELETE FROM billing.property_payment_details WHERE property_id = ?", property);
            jdbc.update("DELETE FROM enquiry.enquiries WHERE property_id = ?", property);
            jdbc.update("DELETE FROM tenancy.bed_holds WHERE property_id = ?", property);
            jdbc.update("DELETE FROM tenancy.tenancy_exit_requests WHERE property_id = ?", property);
            // What onboarding and a started stay leave in other modules. A table a suite never touched has nothing.
            for (String leftover : List.of(
                    "billing.billing_cycle_line_items", "billing.billing_cycles", "compliance.tenancy_agreements",
                    "expense.income_entries")) {
                try {
                    jdbc.update("DELETE FROM " + leftover + " WHERE property_id = ?", property);
                } catch (RuntimeException absent) {
                    // The table keys its rows another way. Its rows name ids that no longer exist, and harm nothing.
                }
            }
            jdbc.update("DELETE FROM tenancy.tenancies WHERE property_id = ?", property);
            jdbc.update("DELETE FROM property.rooms WHERE property_id = ?", property);
            // Room types a test made by hand. Their photos go with them.
            jdbc.update("DELETE FROM property.room_molds WHERE property_id = ?", property);
            jdbc.update("DELETE FROM property.manager_permissions WHERE property_id = ?", property);
            jdbc.update("DELETE FROM property.property_managers WHERE property_id = ?", property);
            jdbc.update("DELETE FROM property.properties WHERE id = ?", property);
        }
        for (UUID person : people) {
            jdbc.update("DELETE FROM mail.outbox WHERE user_id = ?", person);
            jdbc.update("DELETE FROM auth.users WHERE id = ?", person);
        }
        properties.clear();
        people.clear();
    }
}
