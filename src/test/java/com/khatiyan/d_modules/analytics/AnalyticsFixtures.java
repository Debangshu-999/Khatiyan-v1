package com.khatiyan.d_modules.analytics;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Plain-SQL rows for analytics tests. No cross-schema foreign keys exist, so a
 * billing row only needs its property and tenancy IDs, not real ones.
 */
public final class AnalyticsFixtures {

    private static final String SERVICE_CODE = "AADHAAR_OKYC";
    private static final String ID_DOCUMENT = "AADHAAR";

    private final JdbcTemplate jdbc;

    public AnalyticsFixtures(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static String ref(String prefix) {
        return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
    }

    public UUID property(Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property.properties (id, owner_id, name, address, city, pincode, type,
                    created_at, updated_at, reference_code, notice_period, is_active)
                VALUES (?, ?, 'Fixture PG', '1 Test Road', 'Kolkata', '700091', 'PG', ?, now(), ?, 'ONE_MONTH', true)
                """, id, UUID.randomUUID(), Timestamp.from(createdAt), ref("PFX"));
        return id;
    }

    public UUID room(UUID propertyId, int capacity, int occupied, int reserved, String status, boolean active) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property.rooms (id, property_id, room_number, capacity, room_type, conditioning,
                    base_rent_paise, status, created_at, updated_at, is_active, occupied_count, reserved_count)
                VALUES (?, ?, ?, ?, 'TRIPLE', 'NON_AC', 800000, ?, now(), now(), ?, ?, ?)
                """, id, propertyId, ref("R"), capacity, status, active, occupied, reserved);
        return id;
    }

    public UUID monthlyStay(UUID propertyId, UUID roomId, String status, LocalDate startDate, LocalDate endDate) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenancy.tenancies (id, user_id, property_id, room_id, rent_amount_paise, deposit_amount_paise,
                    start_date, end_date, status, is_active, created_at, updated_at, billing_type, reference_code)
                VALUES (?, ?, ?, ?, 800000, 100000, ?, ?, ?, ?, now(), now(), 'MONTHLY', ?)
                """, id, UUID.randomUUID(), propertyId, roomId, startDate, endDate, status,
                !"EXITED".equals(status) && !"EVICTED".equals(status) && !"CANCELLED".equals(status), ref("T"));
        return id;
    }

    public UUID dailyStay(UUID propertyId, UUID roomId, LocalDate startDate, LocalDate plannedEndDate) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenancy.tenancies (id, user_id, property_id, room_id, daily_rate_paise, planned_end_date,
                    start_date, status, is_active, created_at, updated_at, billing_type, reference_code)
                VALUES (?, ?, ?, ?, 50000, ?, ?, 'ACTIVE', true, now(), now(), 'DAILY', ?)
                """, id, UUID.randomUUID(), propertyId, roomId, plannedEndDate, startDate, ref("T"));
        return id;
    }

    /** A bill. {@code paidAt} is null unless the bill is PAID. */
    public UUID cycle(UUID propertyId, String status, String category, LocalDate periodStart, LocalDate dueDate,
            int graceDays, long totalPaise, long lateFeePaise, long discountPaise, Instant paidAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO billing.billing_cycles (id, tenancy_id, tenant_name_snapshot, property_id, room_id,
                    billing_type, period_start_date, period_end_date, rent_due_date, status, created_at, updated_at,
                    reference_code, category, base_amount_paise, extra_charge_paise, late_fee_amount_paise,
                    discount_amount_paise, total_amount_paise, paid_at, rent_grace_days, billing_collection_timing)
                VALUES (?, ?, 'Fixture Tenant', ?, ?, 'MONTHLY', ?, ?, ?, ?, now(), now(),
                    ?, ?, ?, 0, ?, ?, ?, ?, ?, 'CYCLE_START')
                """, id, UUID.randomUUID(), propertyId, UUID.randomUUID(),
                periodStart, periodStart.plusMonths(1).minusDays(1), dueDate, status,
                ref("B"), category, totalPaise, lateFeePaise, discountPaise, totalPaise,
                paidAt == null ? null : Timestamp.from(paidAt), graceDays);
        return id;
    }

    public UUID payment(UUID propertyId, UUID cycleId, String method, long amountPaise, Instant collectedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO billing.billing_manual_payments (id, billing_cycle_id, tenancy_id, property_id,
                    amount_paise, method, collected_by_user_id, collected_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                """, id, cycleId, UUID.randomUUID(), propertyId, amountPaise, method, UUID.randomUUID(),
                Timestamp.from(collectedAt));
        return id;
    }

    public void extraCharge(UUID propertyId, UUID cycleId, String label, long amountPaise, String status) {
        jdbc.update("""
                INSERT INTO billing.billing_cycle_line_items (id, billing_cycle_id, type, label, amount_paise,
                    settlement_amount_paise, settlement_action, system_generated, display_order, created_at,
                    updated_at, tenancy_id, property_id, status)
                VALUES (?, ?, 'EXTRA_CHARGE', ?, ?, 0, 'ADDED_TO_BILL', false, 1, now(), now(), ?, ?, ?)
                """, UUID.randomUUID(), cycleId, label, amountPaise, UUID.randomUUID(), propertyId, status);
    }

    /** A UPI claim. A bill may hold only one live (CREATED or TENANT_CONFIRMED) claim at a time. */
    public UUID paymentIntent(UUID propertyId, UUID cycleId, String status, long amountPaise) {
        UUID id = UUID.randomUUID();
        boolean decided = status.startsWith("OWNER_");
        jdbc.update("""
                INSERT INTO billing.payment_intents (id, billing_cycle_id, property_id, tenancy_id, tenant_user_id,
                    status, amount_paise, reference_code, upi_vpa, created_at, updated_at, tenant_decided_at,
                    owner_decided_at, owner_decided_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'owner@upi', now(), now(), now(), ?, ?)
                """, id, cycleId, propertyId, UUID.randomUUID(), UUID.randomUUID(), status,
                amountPaise, ref("PI"), decided ? Timestamp.from(Instant.now()) : null, decided ? UUID.randomUUID() : null);
        return id;
    }

    public UUID expenseCategory(UUID propertyId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO expense.expense_categories (id, property_id, name, normalized_name, is_system, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, false, true, now(), now())
                """, id, propertyId, name, name.trim().toLowerCase());
        return id;
    }

    /** An expense row. A REVERSAL carries a negative amount and points at what it reverses. */
    public UUID expense(UUID propertyId, UUID categoryId, String paidTo, long amountPaise, LocalDate incurredOn,
            String entryType, UUID reverses) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO expense.expenses (id, property_id, category_id, paid_to, amount_paise, incurred_date,
                    entry_type, reverses_expense_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                """, id, propertyId, categoryId, paidTo, amountPaise, incurredOn, entryType, reverses);
        return id;
    }

    public void income(UUID propertyId, String source, long amountPaise, LocalDate receivedOn, String entryType) {
        jdbc.update("""
                INSERT INTO expense.income_entries (id, property_id, source, amount_paise, received_date, entry_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now(), now())
                """, UUID.randomUUID(), propertyId, source, amountPaise, receivedOn, entryType);
    }

    /** A deposit account with one ADDITION and, optionally, one DEDUCTION. */
    public void deposit(UUID propertyId, String status, long addedPaise, long deductedPaise) {
        UUID account = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO billing.deposit_accounts (id, tenancy_id, tenant_user_id, property_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, now(), now())
                """, account, UUID.randomUUID(), UUID.randomUUID(), propertyId, status);
        jdbc.update("""
                INSERT INTO billing.deposit_movements (id, deposit_account_id, type, reason, amount_paise, created_at, updated_at)
                VALUES (?, ?, 'ADDITION', 'Collected', ?, now(), now())
                """, UUID.randomUUID(), account, addedPaise);
        if (deductedPaise > 0) {
            jdbc.update("""
                    INSERT INTO billing.deposit_movements (id, deposit_account_id, type, reason, amount_paise, created_at, updated_at)
                    VALUES (?, ?, 'DEDUCTION', 'Damage', ?, now(), now())
                    """, UUID.randomUUID(), account, deductedPaise);
        }
    }

    /** A monthly stay for a known tenant user, so profile counts can find them. */
    public UUID monthlyStayFor(UUID propertyId, UUID roomId, UUID userId, String status, LocalDate startDate, LocalDate endDate) {
        UUID id = monthlyStay(propertyId, roomId, status, startDate, endDate);
        jdbc.update("UPDATE tenancy.tenancies SET user_id = ? WHERE id = ?", userId, id);
        return id;
    }

    /**
     * A stay's agreement term and ID-check declaration. A fixed term's planned
     * end is its agreement end. A confirmed check must name the document seen.
     */
    public void stayTerms(UUID tenancyId, LocalDate agreementEndDate, Boolean idCheckConfirmed) {
        boolean checked = Boolean.TRUE.equals(idCheckConfirmed);
        jdbc.update("""
                UPDATE tenancy.tenancies SET agreement_end_date = ?, planned_end_date = ?, id_check_confirmed = ?,
                    id_document_type = ?, id_last_four = ?
                WHERE id = ?
                """, agreementEndDate, agreementEndDate, idCheckConfirmed, checked ? ID_DOCUMENT : null, checked ? "1234" : null, tenancyId);
    }

    public void endStay(UUID tenancyId, String status, LocalDate endDate) {
        jdbc.update("UPDATE tenancy.tenancies SET status = ?, end_date = ?, is_active = false WHERE id = ?", status, endDate, tenancyId);
    }

    public void roomChange(UUID propertyId, UUID tenancyId, UUID fromRoom, UUID toRoom, String status, Instant executedAt) {
        jdbc.update("""
                INSERT INTO tenancy.tenancy_room_change_requests (id, tenancy_id, tenant_user_id, property_id, current_room_id,
                    target_room_id, billing_cycle_id, status, effective_transfer_date, requested_room_rent_amount_paise,
                    executed_at, created_at, updated_at, reference_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, 800000, ?, now(), now(), ?)
                """, UUID.randomUUID(), tenancyId, UUID.randomUUID(), propertyId, fromRoom, toRoom, UUID.randomUUID(), status,
                executedAt == null ? null : Timestamp.from(executedAt), ref("RC"));
    }

    public void verificationGrant(UUID propertyId, UUID tenancyId, String status) {
        jdbc.update("""
                INSERT INTO verification.verification_grants (id, tenancy_id, owner_user_id, property_id, service_code,
                    attempts_granted, attempts_used, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 2, 0, ?, now(), now())
                """, UUID.randomUUID(), tenancyId, UUID.randomUUID(), propertyId, SERVICE_CODE, status);
    }

    public void agreement(UUID propertyId, UUID tenancyId, String status, Instant createdAt, Instant acceptedAt) {
        jdbc.update("""
                INSERT INTO compliance.tenancy_agreements (id, tenancy_id, property_id, status, accepted_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now())
                """, UUID.randomUUID(), tenancyId, propertyId, status,
                acceptedAt == null ? null : Timestamp.from(acceptedAt), Timestamp.from(createdAt));
    }

    public UUID foodProfile(UUID propertyId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_profiles (id, property_id, created_by_user_id, name, category, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'OTHER', now(), now())
                """, id, propertyId, UUID.randomUUID(), name);
        return id;
    }

    /** A running subscription when {@code endedAt} is null, an ended one otherwise. */
    /** A normal plan (one profile all week) from started until ended, as IST days (2026-09-29). */
    public void foodSubscription(UUID propertyId, UUID tenancyId, UUID profileId, Instant startedAt, Instant endedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO food.food_subscriptions (id, property_id, tenancy_id, tenant_user_id,
                    started_at, ended_at, effective_from, effective_until, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, (?::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
                    (?::timestamptz AT TIME ZONE 'Asia/Kolkata')::date, now(), now())
                """, id, propertyId, tenancyId, UUID.randomUUID(),
                Timestamp.from(startedAt), endedAt == null ? null : Timestamp.from(endedAt),
                Timestamp.from(startedAt), endedAt == null ? null : Timestamp.from(endedAt));
        jdbc.update("""
                INSERT INTO food.food_subscription_days (subscription_id, day_of_week, profile_id)
                SELECT ?, d, ? FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) AS d
                """, id, profileId);
    }

    /** A user with just what the profile card reads. Either may be null. */
    public UUID user(String gender, LocalDate dateOfBirth) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified, credential_version,
                    gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, 'Fixture Tenant', 'TENANT', true, true, 0, ?, ?, now(), now())
                """, id, "+91" + (6000000000L + (long) (Math.random() * 3999999999L)), gender, dateOfBirth);
        return id;
    }
}
