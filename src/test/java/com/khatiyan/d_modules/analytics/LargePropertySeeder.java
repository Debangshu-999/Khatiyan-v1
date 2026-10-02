package com.khatiyan.d_modules.analytics;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * One large property with years of history, written straight into the tables.
 *
 * <p>Built for the dashboard speed check (ROADMAP P2.5.a): the target is stated
 * for a 150-bed property three years old, and no such property exists in any
 * database we have. The same rows are the starting point for the realistic
 * seed owner insights need (P1.4.a).
 *
 * <p>What it writes, per bed: a chain of monthly stays from the day the property
 * joined until today, each with its tenant, signed agreement, deposit account,
 * a rent bill for every month stayed with its rent line and its payment, and
 * the occasional extra charge, late fee, discount, one-off bill, concern, exit
 * request and food plan. Around it: three years of expenses and income, and the
 * activity feed those events would have left.
 *
 * <p><b>Seeded from a fixed number</b>, so two runs build the same property and
 * a timing that moves is the code moving, not the data.
 *
 * <p>Not written: daily guest stays, staff and salaries, budgets, managers. A PG
 * of this size is monthly stays, and none of those adds rows in the thousands.
 */
public final class LargePropertySeeder {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final int GRACE_DAYS = 5;
    private static final long LATE_FEE_PER_DAY_PAISE = 5_000;

    private static final String[] PAYMENT_METHODS = {
            "UPI", "UPI", "UPI", "UPI", "UPI", "UPI", "CASH", "CASH", "CASH", "BANK_TRANSFER" };
    private static final String[] EXTRA_LABELS = { "Electricity", "Laundry", "Guest stay", "Damage", "Extra meals" };
    private static final String[] CONCERN_CATEGORIES = {
            "MAINTENANCE", "CLEANING", "WIFI", "MESS", "WATER", "ELECTRICITY", "NOISE", "OTHER" };
    private static final String[] EXPENSE_CATEGORIES = {
            "Groceries", "Electricity", "Water", "Repairs", "Housekeeping", "Internet", "Gas", "Miscellaneous" };
    private static final String[] GENDERS = { "MALE", "MALE", "MALE", "FEMALE", "FEMALE", "UNDECLARED" };

    /** What was written, so the caller can report it and remove it. */
    public record Seeded(
            UUID ownerId, UUID propertyId, LocalDate registeredOn, int rooms, int beds, int stays, int liveStays,
            int bills, int payments, int lineItems, int expenses, int concerns, int exitRequests,
            int activityEvents, List<UUID> userIds) {
    }

    private record Bed(UUID roomId, long rentPaise) {
    }

    private final JdbcTemplate jdbc;
    private final Random random;
    private final LocalDate today;
    private int codes;
    // Phones and reference codes are unique across the database, so each seed
    // number gets its own range. Two properties can then be seeded side by side.
    private final String codePrefix;
    private long phones;

    private final List<Object[]> users = new ArrayList<>();
    private final List<Object[]> stays = new ArrayList<>();
    private final List<Object[]> agreements = new ArrayList<>();
    private final List<Object[]> depositAccounts = new ArrayList<>();
    private final List<Object[]> depositMovements = new ArrayList<>();
    private final List<Object[]> bills = new ArrayList<>();
    private final List<Object[]> lineItems = new ArrayList<>();
    private final List<Object[]> payments = new ArrayList<>();
    private final List<Object[]> concerns = new ArrayList<>();
    private final List<Object[]> exitRequests = new ArrayList<>();
    private final List<Object[]> activity = new ArrayList<>();
    private final List<Object[]> foodPlans = new ArrayList<>();
    private final List<UUID> userIds = new ArrayList<>();
    private int liveStays;

    private LargePropertySeeder(JdbcTemplate jdbc, LocalDate today, long randomSeed) {
        this.jdbc = jdbc;
        this.today = today;
        this.random = new Random(randomSeed);
        this.codePrefix = "S" + Math.floorMod(randomSeed, 1000);
        this.phones = 7_000_000_000L + Math.floorMod(randomSeed, 1000) * 1_000_000L;
    }

    /**
     * Writes the property and everything in it.
     *
     * @param beds  how many beds, spread over triple, double and single rooms
     * @param years how long ago the property joined
     */
    public static Seeded seed(JdbcTemplate jdbc, LocalDate today, int beds, int years, long randomSeed) {
        return new LargePropertySeeder(jdbc, today, randomSeed).write(beds, years);
    }

    private Seeded write(int bedCount, int years) {
        LocalDate registeredOn = today.minusYears(years);
        UUID ownerId = user("OWNER", "Speed Check Owner", null, null, registeredOn);
        UUID propertyId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property.properties (id, owner_id, name, address, city, pincode, type,
                    created_at, updated_at, reference_code, notice_period, is_active)
                VALUES (?, ?, 'Speed Check PG', '1 Test Road', 'Kolkata', '700091', 'PG', ?, now(), ?, 'ONE_MONTH', true)
                """, propertyId, ownerId, at(registeredOn, 9), code("PROP"));

        List<UUID> roomIds = new ArrayList<>();
        List<Integer> capacities = new ArrayList<>();
        List<Bed> beds = rooms(bedCount, roomIds, capacities);
        int[] occupied = new int[roomIds.size()];

        AnalyticsFixtures fixtures = new AnalyticsFixtures(jdbc);
        UUID[] foodProfiles = {
                fixtures.foodProfile(propertyId, "Veg"),
                fixtures.foodProfile(propertyId, "Non veg"),
                fixtures.foodProfile(propertyId, "Jain") };

        for (Bed bed : beds) {
            LocalDate cursor = registeredOn.plusDays(random.nextInt(75));
            while (cursor.isBefore(today)) {
                LocalDate end = cursor.plusMonths(2L + random.nextInt(13));
                boolean live = !end.isBefore(today);
                stay(propertyId, bed, cursor, end, live, foodProfiles);
                if (live) {
                    occupied[roomIds.indexOf(bed.roomId())]++;
                }
                cursor = end.plusDays(random.nextInt(25));
            }
        }

        List<Object[]> rooms = new ArrayList<>();
        for (int at = 0; at < roomIds.size(); at++) {
            int capacity = capacities.get(at);
            String type = capacity == 3 ? "TRIPLE" : capacity == 2 ? "DOUBLE" : "SINGLE";
            String status = occupied[at] == 0 ? "VACANT" : occupied[at] == capacity ? "OCCUPIED" : "PARTIALLY_OCCUPIED";
            rooms.add(new Object[] { roomIds.get(at), propertyId, String.valueOf(101 + at), capacity, type,
                    at % 4 == 0 ? "AC" : "NON_AC", rentFor(capacity), status, at(registeredOn, 9), occupied[at] });
        }
        jdbc.batchUpdate("""
                INSERT INTO property.rooms (id, property_id, room_number, capacity, room_type, conditioning,
                    base_rent_paise, status, created_at, updated_at, is_active, occupied_count, reserved_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), true, ?, 0)
                """, rooms);

        int expenses = expensesAndIncome(propertyId, registeredOn);
        flush(propertyId, foodProfiles);

        return new Seeded(ownerId, propertyId, registeredOn, roomIds.size(), beds.size(), stays.size(), liveStays,
                bills.size(), payments.size(), lineItems.size(), expenses, concerns.size(), exitRequests.size(),
                activity.size(), List.copyOf(userIds));
    }

    /** Triple, double and single rooms in turn until the beds are used up. */
    private List<Bed> rooms(int bedCount, List<UUID> roomIds, List<Integer> capacities) {
        int[] pattern = { 3, 2, 2, 1 };
        List<Bed> beds = new ArrayList<>();
        for (int at = 0; beds.size() < bedCount; at++) {
            int capacity = Math.min(pattern[at % pattern.length], bedCount - beds.size());
            UUID roomId = UUID.randomUUID();
            roomIds.add(roomId);
            capacities.add(capacity);
            for (int bed = 0; bed < capacity; bed++) {
                beds.add(new Bed(roomId, rentFor(capacity)));
            }
        }
        return beds;
    }

    private static long rentFor(int capacity) {
        return capacity == 3 ? 650_000 : capacity == 2 ? 850_000 : 1_200_000;
    }

    private void stay(UUID propertyId, Bed bed, LocalDate start, LocalDate end, boolean live, UUID[] foodProfiles) {
        UUID userId = user("USER", "Tenant " + (userIds.size() + 1), GENDERS[random.nextInt(GENDERS.length)],
                start.minusYears(19L + random.nextInt(18)).minusDays(random.nextInt(300)), start.minusDays(5));
        UUID tenancyId = UUID.randomUUID();
        long deposit = bed.rentPaise();

        // A live stay in its last month is on notice about one time in twelve.
        boolean onNotice = live && random.nextInt(12) == 0;
        LocalDate noticeEnd = onNotice ? cycleEndOnOrAfter(start, today) : null;
        String status = !live ? "EXITED" : onNotice ? "ON_NOTICE" : "ACTIVE";
        stays.add(new Object[] { tenancyId, userId, propertyId, bed.roomId(), bed.rentPaise(), deposit, start,
                live ? noticeEnd : end, status, live, at(start.minusDays(3), 11), code("TEN") });
        if (live) {
            liveStays++;
        }

        agreements.add(new Object[] { UUID.randomUUID(), tenancyId, propertyId,
                at(start.minusDays(2), 18), at(start.minusDays(3), 11) });

        UUID depositAccount = UUID.randomUUID();
        depositAccounts.add(new Object[] { depositAccount, tenancyId, userId, propertyId,
                live ? "ACTIVE" : "SETTLED", at(start, 12) });
        depositMovements.add(new Object[] { UUID.randomUUID(), depositAccount, "ADDITION", "Collected", deposit, at(start, 12) });
        if (!live && random.nextInt(5) == 0) {
            depositMovements.add(new Object[] { UUID.randomUUID(), depositAccount, "DEDUCTION", "Damage",
                    50_000L + random.nextInt(150_000), at(end, 12) });
        }

        activity.add(event(propertyId, "TENANCY_STARTED", "Tenancy started", at(start, 10)));
        if (!live) {
            activity.add(event(propertyId, "TENANCY_ENDED", "Tenancy ended", at(end, 11)));
        }

        rentBills(propertyId, bed, tenancyId, start, end, live);
        if (random.nextInt(100) < 35) {
            oneOffBill(propertyId, bed, tenancyId, start, live ? today : end);
        }
        concernsFor(propertyId, bed, tenancyId, userId, start, live ? today : end);

        if (!live && random.nextInt(100) < 60) {
            exitRequests.add(new Object[] { UUID.randomUUID(), tenancyId, userId, propertyId, bed.roomId(),
                    "NORMAL_NOTICE", "EXECUTED", end, at(end.minusDays(28), 10), end.minusDays(28), code("TEX"), end });
        } else if (onNotice) {
            exitRequests.add(new Object[] { UUID.randomUUID(), tenancyId, userId, propertyId, bed.roomId(),
                    "NORMAL_NOTICE", "APPROVED", noticeEnd, at(today.minusDays(4), 10), today.minusDays(4),
                    code("TEX"), noticeEnd });
        }

        if (random.nextInt(100) < 60) {
            foodPlans.add(new Object[] { tenancyId, foodProfiles[random.nextInt(foodProfiles.length)],
                    at(start, 13).toInstant(), live ? null : at(end, 9).toInstant() });
        }
    }

    /** The last day of the monthly cycle that holds {@code day}, counted from the stay's start. */
    private static LocalDate cycleEndOnOrAfter(LocalDate start, LocalDate day) {
        long months = ChronoUnit.MONTHS.between(start, day);
        return start.plusMonths(months + 1).minusDays(1);
    }

    private void rentBills(UUID propertyId, Bed bed, UUID tenancyId, LocalDate start, LocalDate end, boolean live) {
        // Bills are generated ten days ahead of a cycle, so a live stay has its next one already.
        LocalDate stop = live ? today.plusDays(10) : end;
        for (int month = 0; start.plusMonths(month).isBefore(stop); month++) {
            LocalDate periodStart = start.plusMonths(month);
            LocalDate due = periodStart.plusDays(GRACE_DAYS);
            long extra = random.nextInt(10) == 0 ? 20_000L + random.nextInt(130_000) : 0;
            long discount = random.nextInt(33) == 0 ? 20_000L + random.nextInt(30_000) : 0;
            long lateFee = 0;
            String status;
            Timestamp paidAt = null;

            boolean old = !live || due.isBefore(today.minusDays(60));
            if (periodStart.isAfter(today)) {
                status = "UPCOMING";
            } else if (old && random.nextInt(250) == 0) {
                status = "CANCELLED";
            } else if (old || random.nextInt(10) != 0) {
                LocalDate paidOn;
                if (random.nextInt(100) < 15) {
                    paidOn = due.plusDays(1L + random.nextInt(12));
                    lateFee = LATE_FEE_PER_DAY_PAISE * ChronoUnit.DAYS.between(due, paidOn);
                } else {
                    paidOn = periodStart.plusDays(random.nextInt(GRACE_DAYS + 1));
                }
                if (paidOn.isAfter(today)) {
                    // Not paid yet: the window is still open, or the late day has not come.
                    lateFee = 0;
                    status = due.isBefore(today) ? "OVERDUE" : "UNPAID";
                } else {
                    status = "PAID";
                    paidAt = at(paidOn, 9 + random.nextInt(11));
                }
            } else {
                status = due.isBefore(today) ? "OVERDUE" : "UNPAID";
            }
            if ("OVERDUE".equals(status)) {
                lateFee = LATE_FEE_PER_DAY_PAISE * ChronoUnit.DAYS.between(due, today);
            }

            long total = bed.rentPaise() + extra + lateFee - discount;
            UUID billId = UUID.randomUUID();
            bills.add(new Object[] { billId, tenancyId, propertyId, bed.roomId(), periodStart,
                    periodStart.plusMonths(1).minusDays(1), due, status, at(periodStart.minusDays(10), 0),
                    code("BIL"), "RENT_CYCLE", bed.rentPaise(), extra, lateFee, discount, total, paidAt, GRACE_DAYS,
                    month + 1 });
            lineItems.add(line(billId, tenancyId, propertyId, "RENT", "Rent", bed.rentPaise(), "SYSTEM_CHARGE", true, 1));
            if (extra > 0) {
                lineItems.add(line(billId, tenancyId, propertyId, "EXTRA_CHARGE",
                        EXTRA_LABELS[random.nextInt(EXTRA_LABELS.length)], extra, "ADDED_TO_BILL", false, 2));
            }
            if (paidAt != null) {
                pay(propertyId, tenancyId, billId, total, paidAt);
            }
        }
    }

    private void oneOffBill(UUID propertyId, Bed bed, UUID tenancyId, LocalDate start, LocalDate until) {
        long days = Math.max(1, ChronoUnit.DAYS.between(start, until));
        LocalDate raised = start.plusDays(random.nextInt((int) days));
        long amount = 30_000L + random.nextInt(270_000);
        boolean paid = raised.isBefore(today.minusDays(20)) || random.nextBoolean();
        Timestamp paidAt = paid ? at(minOf(raised.plusDays(random.nextInt(6)), today), 15) : null;
        UUID billId = UUID.randomUUID();
        bills.add(new Object[] { billId, tenancyId, propertyId, bed.roomId(), raised, raised, raised.plusDays(7),
                paid ? "PAID" : "UNPAID", at(raised, 10), code("BIL"), "ONE_OFF", 0L, amount, 0L, 0L, amount, paidAt, 0,
                null });
        lineItems.add(line(billId, tenancyId, propertyId, "EXTRA_CHARGE",
                EXTRA_LABELS[random.nextInt(EXTRA_LABELS.length)], amount, "ADDED_TO_BILL", false, 1));
        if (paid) {
            pay(propertyId, tenancyId, billId, amount, paidAt);
        }
    }

    private void pay(UUID propertyId, UUID tenancyId, UUID billId, long amount, Timestamp paidAt) {
        payments.add(new Object[] { UUID.randomUUID(), billId, tenancyId, propertyId, amount,
                PAYMENT_METHODS[random.nextInt(PAYMENT_METHODS.length)], UUID.randomUUID(), paidAt });
        activity.add(event(propertyId, "PAYMENT_RECORDED", "Payment recorded", paidAt));
    }

    private Object[] line(UUID billId, UUID tenancyId, UUID propertyId, String type, String label, long amount,
            String action, boolean system, int order) {
        return new Object[] { UUID.randomUUID(), billId, type, label, amount, action, system, order, tenancyId, propertyId };
    }

    /** About one concern for every seven months a tenant stays. */
    private void concernsFor(UUID propertyId, Bed bed, UUID tenancyId, UUID userId, LocalDate start, LocalDate until) {
        for (LocalDate month = start; month.isBefore(until); month = month.plusMonths(1)) {
            if (random.nextInt(7) != 0) {
                continue;
            }
            LocalDate raised = minOf(month.plusDays(random.nextInt(28)), today);
            String status = raised.isBefore(today.minusDays(20))
                    ? (random.nextInt(7) == 0 ? "RESOLVED" : "CLOSED")
                    : new String[] { "OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED" }[random.nextInt(4)];
            String category = CONCERN_CATEGORIES[random.nextInt(CONCERN_CATEGORIES.length)];
            concerns.add(new Object[] { UUID.randomUUID(), propertyId, bed.roomId(), tenancyId, userId, category,
                    status, "Concern about " + category.toLowerCase(), "Raised by the speed check seed.",
                    at(raised, 9 + random.nextInt(10)), code("CON") });
            activity.add(event(propertyId, "CONCERN_RAISED", "Concern raised", at(raised, 10)));
        }
    }

    private int expensesAndIncome(UUID propertyId, LocalDate registeredOn) {
        AnalyticsFixtures fixtures = new AnalyticsFixtures(jdbc);
        UUID[] categories = new UUID[EXPENSE_CATEGORIES.length];
        for (int at = 0; at < categories.length; at++) {
            categories[at] = fixtures.expenseCategory(propertyId, EXPENSE_CATEGORIES[at]);
        }

        List<Object[]> expenses = new ArrayList<>();
        List<Object[]> income = new ArrayList<>();
        for (LocalDate month = registeredOn.withDayOfMonth(1); !month.isAfter(today); month = month.plusMonths(1)) {
            for (int row = 0; row < 40; row++) {
                LocalDate day = minOf(month.plusDays(random.nextInt(month.lengthOfMonth())), today);
                if (day.isBefore(registeredOn)) {
                    day = registeredOn;
                }
                expenses.add(new Object[] { UUID.randomUUID(), propertyId, categories[random.nextInt(categories.length)],
                        "Payee " + random.nextInt(25), 50_000L + random.nextInt(3_950_000), day,
                        row < 6 ? "RECURRING" : "MANUAL" });
            }
            for (int row = 0; row < 2; row++) {
                LocalDate day = minOf(month.plusDays(random.nextInt(month.lengthOfMonth())), today);
                income.add(new Object[] { UUID.randomUUID(), propertyId, row == 0 ? "Laundry" : "Parking",
                        100_000L + random.nextInt(400_000), day.isBefore(registeredOn) ? registeredOn : day });
            }
        }
        jdbc.batchUpdate("""
                INSERT INTO expense.expenses (id, property_id, category_id, paid_to, amount_paise, incurred_date,
                    entry_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
                """, expenses);
        jdbc.batchUpdate("""
                INSERT INTO expense.income_entries (id, property_id, source, amount_paise, received_date, entry_type,
                    created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'MANUAL', now(), now())
                """, income);
        return expenses.size();
    }

    private void flush(UUID propertyId, UUID[] foodProfiles) {
        jdbc.batchUpdate("""
                INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified, credential_version,
                    gender, date_of_birth, created_at, updated_at)
                VALUES (?, ?, ?, ?, true, true, 0, ?, ?, ?, now())
                """, users);
        jdbc.batchUpdate("""
                INSERT INTO tenancy.tenancies (id, user_id, property_id, room_id, rent_amount_paise, deposit_amount_paise,
                    start_date, end_date, status, is_active, created_at, updated_at, billing_type, reference_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), 'MONTHLY', ?)
                """, stays);
        jdbc.batchUpdate("""
                INSERT INTO compliance.tenancy_agreements (id, tenancy_id, property_id, status, accepted_at, created_at, updated_at)
                VALUES (?, ?, ?, 'ACCEPTED', ?, ?, now())
                """, agreements);
        jdbc.batchUpdate("""
                INSERT INTO billing.deposit_accounts (id, tenancy_id, tenant_user_id, property_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now())
                """, depositAccounts);
        jdbc.batchUpdate("""
                INSERT INTO billing.deposit_movements (id, deposit_account_id, type, reason, amount_paise, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, now())
                """, depositMovements);
        jdbc.batchUpdate("""
                INSERT INTO billing.billing_cycles (id, tenancy_id, tenant_name_snapshot, property_id, room_id,
                    billing_type, period_start_date, period_end_date, rent_due_date, status, created_at, updated_at,
                    reference_code, category, base_amount_paise, extra_charge_paise, late_fee_amount_paise,
                    discount_amount_paise, total_amount_paise, paid_at, rent_grace_days, billing_collection_timing,
                    cycle_number)
                VALUES (?, ?, 'Speed Check Tenant', ?, ?, 'MONTHLY', ?, ?, ?, ?, ?, now(),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CYCLE_START', ?)
                """, bills);
        jdbc.batchUpdate("""
                INSERT INTO billing.billing_cycle_line_items (id, billing_cycle_id, type, label, amount_paise,
                    settlement_amount_paise, settlement_action, system_generated, display_order, created_at,
                    updated_at, tenancy_id, property_id, status)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, now(), now(), ?, ?, 'ADDED')
                """, lineItems);
        jdbc.batchUpdate("""
                INSERT INTO billing.billing_manual_payments (id, billing_cycle_id, tenancy_id, property_id,
                    amount_paise, method, collected_by_user_id, collected_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), now())
                """, payments);
        jdbc.batchUpdate("""
                INSERT INTO concern.concerns (id, property_id, room_id, tenancy_id, raised_by_user_id, category, status,
                    title, description, created_at, updated_at, reference_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), ?)
                """, concerns);
        jdbc.batchUpdate("""
                INSERT INTO tenancy.tenancy_exit_requests (id, tenancy_id, tenant_user_id, property_id, room_id, type,
                    status, requested_checkout_date, created_at, updated_at, notice_anchor_date, reference_code,
                    approved_checkout_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), ?, ?, ?)
                """, exitRequests);
        jdbc.batchUpdate("""
                INSERT INTO dashboard.activity_events (id, property_id, type, title, occurred_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, activity);

        AnalyticsFixtures fixtures = new AnalyticsFixtures(jdbc);
        for (Object[] plan : foodPlans) {
            fixtures.foodSubscription(propertyId, (UUID) plan[0], (UUID) plan[1], (Instant) plan[2], (Instant) plan[3]);
        }
    }

    /** Removes everything {@link #seed} wrote, so the shared test database is left as it was found. */
    public static void remove(JdbcTemplate jdbc, Seeded seeded) {
        if (seeded == null) {
            // A seed that failed half way left nothing to name. Its rows go with the throwaway database.
            return;
        }
        UUID property = seeded.propertyId();
        jdbc.update("""
                DELETE FROM food.food_subscription_days WHERE subscription_id IN
                    (SELECT id FROM food.food_subscriptions WHERE property_id = ?)
                """, property);
        jdbc.update("""
                DELETE FROM billing.deposit_movements WHERE deposit_account_id IN
                    (SELECT id FROM billing.deposit_accounts WHERE property_id = ?)
                """, property);
        for (String table : List.of(
                "food.food_subscriptions", "food.food_profiles", "dashboard.activity_events",
                "tenancy.tenancy_exit_requests", "concern.concerns", "billing.billing_manual_payments",
                "billing.billing_cycle_line_items", "billing.billing_cycles", "billing.deposit_accounts",
                "compliance.tenancy_agreements", "tenancy.tenancies", "expense.income_entries", "expense.expenses",
                "expense.expense_categories", "property.rooms")) {
            jdbc.update("DELETE FROM " + table + " WHERE property_id = ?", property);
        }
        jdbc.update("DELETE FROM property.properties WHERE id = ?", property);
        jdbc.batchUpdate("DELETE FROM auth.users WHERE id = ?", seeded.userIds().stream().map(id -> new Object[] { id }).toList());
    }

    private UUID user(String role, String name, String gender, LocalDate dateOfBirth, LocalDate joined) {
        UUID id = UUID.randomUUID();
        users.add(new Object[] { id, "+91" + phones++, name, role, gender, dateOfBirth, at(joined, 10) });
        userIds.add(id);
        if ("OWNER".equals(role)) {
            // The owner has to exist before the property that names them is read.
            jdbc.update("""
                    INSERT INTO auth.users (id, phone, full_name, role, is_active, is_phone_verified,
                        credential_version, gender, date_of_birth, created_at, updated_at)
                    VALUES (?, ?, ?, ?, true, true, 0, ?, ?, ?, now())
                    """, users.remove(users.size() - 1));
        }
        return id;
    }

    private Object[] event(UUID propertyId, String type, String title, Timestamp when) {
        return new Object[] { UUID.randomUUID(), propertyId, type, title, when, when };
    }

    private String code(String prefix) {
        return codePrefix + "-" + prefix + "-" + String.format("%06d", ++codes);
    }

    private static LocalDate minOf(LocalDate first, LocalDate second) {
        return first.isBefore(second) ? first : second;
    }

    /** An IST wall-clock moment, as the timestamp the column stores. */
    private static Timestamp at(LocalDate day, int hour) {
        return Timestamp.from(day.atTime(LocalTime.of(hour % 24, 0)).atZone(IST).toInstant());
    }
}
