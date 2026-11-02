package com.khatiyan.d_modules.billing.damage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.CustomCharge;
import com.khatiyan.d_modules.billing.api.dto.ApplyExitPolicyRequest.DamageCharge;
import com.khatiyan.d_modules.billing.api.dto.BillingCycleResponse;
import com.khatiyan.d_modules.billing.api.dto.CancelOneOffBillRequest;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordResponse;
import com.khatiyan.d_modules.billing.api.dto.RaiseDamageBillRequest;
import com.khatiyan.d_modules.billing.api.dto.RepairDamageRecordRequest;
import com.khatiyan.d_modules.billing.api.dto.SaveDamageRecordRequest;
import com.khatiyan.d_modules.billing.service.BillingCycleService;
import com.khatiyan.d_modules.billing.service.DepositManagerService;
import com.khatiyan.d_modules.billing.service.ExitSettlementService;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.support.IntegrationTest;

/**
 * Damage at checkout (2026-10-31) against the real schema: a room of two, the
 * first tenant leaving with a Rs 9,000 deposit.
 */
@IntegrationTest
class DamageBillServiceTest {

    private static final long DEPOSIT = 900_000L;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DamageRecordService damage;
    @Autowired private DamageBillService damageBills;
    @Autowired private BillingCycleService billing;
    @Autowired private DepositManagerService deposits;
    @Autowired private ExitSettlementService exits;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID leaving;
    private UUID staying;

    @BeforeEach
    void seed() {
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 2, 2);
        UUID tenant = fx.appUser();
        leaving = fx.stay(property, room, tenant, "ACTIVE", null);
        staying = fx.stay(property, room, fx.appUser(), "ACTIVE", null);
        UUID account = UUID.randomUUID();
        jdbc.update("INSERT INTO billing.deposit_accounts (id, tenancy_id, tenant_user_id, property_id, status, created_at, updated_at) "
                + "VALUES (?, ?, ?, ?, 'ACTIVE', now(), now())", account, leaving, tenant, property);
        jdbc.update("INSERT INTO billing.deposit_movements (id, deposit_account_id, type, reason, amount_paise, created_at, updated_at) "
                + "VALUES (?, ?, 'ADDITION', 'Deposit', ?, now(), now())", UUID.randomUUID(), account, DEPOSIT);
    }

    @AfterEach
    void remove() throws InterruptedException {
        for (int waited = 0; waited < 50 && unfinishedEvents() > 0; waited++) {
            Thread.sleep(100);
        }
        jdbc.update("DELETE FROM billing.deposit_movements WHERE deposit_account_id IN "
                + "(SELECT id FROM billing.deposit_accounts WHERE property_id = ?)", property);
        jdbc.update("DELETE FROM billing.deposit_accounts WHERE property_id = ?", property);
        jdbc.update("DELETE FROM billing.damage_records WHERE property_id = ?", property);
        fx.remove();
    }

    @Test
    void aSplitTakesTheDepositAndTheRestBlocksTheExit() {
        DamageRecordResponse ac = damage.create(owner, property, one(800_000L));
        DamageRecordResponse fan = damage.create(owner, property, one(400_000L));

        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id(), fan.id()), DEPOSIT));

        assertThat(bill.status().name()).isEqualTo("UNPAID");
        assertThat(bill.totalAmountPaise()).isEqualTo(300_000L);
        assertThat(deposits.availableBalance(leaving)).isZero();
        assertThat(share(ac.id()).depositPaise()).isEqualTo(800_000L);
        assertThat(share(fan.id()).depositPaise()).isEqualTo(100_000L);
        assertThat(share(fan.id()).billCode()).isEqualTo(bill.referenceCode());
        assertThatThrownBy(() -> billing.ensureLatestCyclePaidForExit(owner, leaving)).isInstanceOf(ValidationException.class);

        jdbc.update("UPDATE billing.billing_cycles SET status = 'PAID' WHERE id = ?", bill.id());
        assertPastTheUnpaidGate();
        assertThat(deposits.availableBalance(leaving)).isZero();
    }

    @Test
    void movingBackRestoresTheDepositAndTheBillHoldsItAll() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_200_000L));
        BillingCycleResponse split = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id()), DEPOSIT));
        assertThat(split.lineItems()).hasSize(2);
        assertThat(damage.listForTenancy(owner, leaving).get(0).locked()).isTrue();

        BillingCycleResponse back = damageBills.moveOffDeposit(owner, split.id());

        assertThat(back.totalAmountPaise()).isEqualTo(1_200_000L);
        assertThat(back.lineItems()).hasSize(1);
        assertThat(deposits.availableBalance(leaving)).isEqualTo(DEPOSIT);
        assertThat(share(ac.id()).depositPaise()).isZero();
        assertThat(damage.listForTenancy(owner, leaving).get(0).locked()).isFalse();
    }

    @Test
    void chargeTwiceThenMoveBackRestoresEverything() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_200_000L));
        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id()), 200_000L));
        assertThat(bill.totalAmountPaise()).isEqualTo(1_000_000L);

        BillingCycleResponse more = damageBills.chargeFromDeposit(owner, bill.id());
        assertThat(more.totalAmountPaise()).isEqualTo(300_000L);
        assertThat(share(ac.id()).depositPaise()).isEqualTo(DEPOSIT);

        BillingCycleResponse back = damageBills.moveOffDeposit(owner, bill.id());
        assertThat(back.totalAmountPaise()).isEqualTo(1_200_000L);
        assertThat(deposits.availableBalance(leaving)).isEqualTo(DEPOSIT);
    }

    @Test
    void aBillFromDuringTheStayPartPaysFromTheDeposit() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_000_000L));
        UUID bill = damage.charge(owner, property, ac.id()).shares().get(0).billId();

        BillingCycleResponse charged = damageBills.chargeFromDeposit(owner, bill);

        assertThat(charged.totalAmountPaise()).isEqualTo(100_000L);
        assertThat(charged.status().name()).isEqualTo("UNPAID");
        assertThat(deposits.availableBalance(leaving)).isZero();
    }

    @Test
    void changingABillCancelsItAndPutsEverythingBack() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_100_000L));
        DamageRecordResponse fan = damage.create(owner, property, one(400_000L));
        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id(), fan.id()), DEPOSIT));

        BillingCycleResponse after = damageBills.cancelToChange(owner, bill.id());

        assertThat(after.status().name()).isEqualTo("CANCELLED");
        assertThat(deposits.availableBalance(leaving)).isEqualTo(DEPOSIT);
        for (UUID id : List.of(ac.id(), fan.id())) {
            assertThat(share(id).billId()).isNull();
            assertThat(share(id).depositPaise()).isZero();
        }
        assertThat(damage.listForTenancy(owner, leaving)).allSatisfy(record -> assertThat(record.locked()).isFalse());
        // Both are back in the list: the exit needs them decided.
        assertThatThrownBy(() -> exits.applyExitPolicy(owner, leaving, property, new ApplyExitPolicyRequest(null, null, true, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("damage records changed");
    }

    @Test
    void aClaimedBillCannotBeCancelledToChangeIt() {
        DamageRecordResponse ac = damage.create(owner, property, one(300_000L));
        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id()), null));
        jdbc.update("UPDATE billing.billing_cycles SET status = 'CONFIRMATION_PENDING' WHERE id = ?", bill.id());

        assertThatThrownBy(() -> damageBills.cancelToChange(owner, bill.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("awaiting confirmation");
    }

    @Test
    void aBillFullyCoveredStopsBlocking() {
        DamageRecordResponse ac = damage.create(owner, property, one(500_000L));
        UUID bill = damage.charge(owner, property, ac.id()).shares().get(0).billId();

        BillingCycleResponse charged = damageBills.chargeFromDeposit(owner, bill);

        assertThat(charged.status().name()).isEqualTo("PAID");
        assertThat(deposits.availableBalance(leaving)).isEqualTo(400_000L);
        assertPastTheUnpaidGate();
        assertThatThrownBy(() -> damageBills.moveOffDeposit(owner, bill)).isInstanceOf(ValidationException.class);
    }

    @Test
    void moveBackIsRefusedOnceClaimedOrPaid() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_200_000L));
        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id()), DEPOSIT));

        jdbc.update("UPDATE billing.billing_cycles SET status = 'CONFIRMATION_PENDING' WHERE id = ?", bill.id());

        assertThatThrownBy(() -> damageBills.moveOffDeposit(owner, bill.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("awaiting confirmation");
    }

    @Test
    void aBillOnTheDepositCannotBeCancelled() {
        DamageRecordResponse ac = damage.create(owner, property, one(1_200_000L));
        BillingCycleResponse bill = damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(ac.id()), DEPOSIT));

        assertThatThrownBy(() -> billing.cancelOneOffBill(owner, bill.id(), new CancelOneOffBillRequest("Changed my mind")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("came off the deposit");
    }

    @Test
    void aSplitChargesOnlyTheLeavingTenantsRecord() {
        damage.create(owner, property, new SaveDamageRecordRequest(room, "Cupboard", "ROOM",
                DamageLevel.D3, 300_000L, null, List.of("c.jpg"), DamageResponsibility.SPLIT, null));
        DamageRecordResponse theirs = damage.listForTenancy(owner, leaving).get(0);

        damageBills.raise(owner, leaving, new RaiseDamageBillRequest(List.of(theirs.id()), null));

        DamageRecordResponse after = damage.listForTenancy(owner, leaving).get(0);
        assertThat(shareOf(after, leaving).billId()).isNotNull();
        assertThat(after.charged()).isTrue();
        DamageRecordResponse stayingRecord = damage.listForTenancy(owner, staying).get(0);
        assertThat(shareOf(stayingRecord, staying).billId()).isNull();
        assertThat(stayingRecord.charged()).isFalse();
    }

    @Test
    void theExitTakesTheDepositAndWaivesTheRest() {
        DamageRecordResponse ac = damage.create(owner, property, one(300_000L));
        DamageRecordResponse fan = damage.create(owner, property, one(100_000L));

        exits.applyExitPolicy(owner, leaving, property, new ApplyExitPolicyRequest(null,
                new DamageCharge(List.of(ac.id()), List.of(fan.id())), true, null));

        assertThat(share(ac.id()).depositPaise()).isEqualTo(300_000L);
        assertThat(share(fan.id()).waived()).isTrue();
        DamageRecordResponse waived = damage.listForTenancy(owner, leaving).stream()
                .filter(record -> record.id().equals(fan.id())).findFirst().orElseThrow();
        assertThat(waived.charged()).isTrue();
        assertThat(waived.locked()).isTrue();
        assertThatThrownBy(() -> damage.charge(owner, property, fan.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already charged");
        // The item is still damaged.
        DamageRecordResponse fixed = damage.repair(owner, property, fan.id(),
                new RepairDamageRecordRequest(DamageLevel.D1, List.of("fixed.jpg"), "Fixed"));
        assertThat(fixed.status()).isEqualTo(DamageRecordStatus.REPAIRED);
    }

    @Test
    void aMismatchedSetIsRefused() {
        DamageRecordResponse ac = damage.create(owner, property, one(300_000L));
        damage.create(owner, property, one(100_000L));

        assertThatThrownBy(() -> exits.applyExitPolicy(owner, leaving, property, new ApplyExitPolicyRequest(null,
                new DamageCharge(List.of(ac.id()), List.of()), true, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("damage records changed");
        assertThatThrownBy(() -> exits.applyExitPolicy(owner, leaving, property, new ApplyExitPolicyRequest(null, null, true, null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("damage records changed");
    }

    @Test
    void otherChargesAreRecordedPaidWithANonRefundableDeposit() {
        exits.applyExitPolicy(owner, leaving, property, new ApplyExitPolicyRequest(null, null,
                List.of(new CustomCharge("Lost room key", 30_000L)), null, false, null));

        assertThat(jdbc.queryForObject("SELECT status FROM billing.billing_cycles WHERE tenancy_id = ?", String.class, leaving))
                .isEqualTo("PAID");
        assertThat(deposits.availableBalance(leaving)).isZero();
    }

    /** The gate's next step looks for a rent cycle, which this fixture's stay never had. */
    private void assertPastTheUnpaidGate() {
        assertThatThrownBy(() -> billing.ensureLatestCyclePaidForExit(owner, leaving)).isInstanceOf(NotFoundException.class);
    }

    private SaveDamageRecordRequest one(long costPaise) {
        return new SaveDamageRecordRequest(room, "AC", "ROOM", DamageLevel.D2, costPaise, "Grille bent",
                List.of("ac.jpg"), DamageResponsibility.TENANT, leaving);
    }

    private DamageRecordResponse.Share share(UUID recordId) {
        return shareOf(damage.listForTenancy(owner, leaving).stream()
                .filter(record -> record.id().equals(recordId)).findFirst().orElseThrow(), leaving);
    }

    private static DamageRecordResponse.Share shareOf(DamageRecordResponse record, UUID tenancy) {
        return record.shares().stream().filter(share -> share.tenancyId().equals(tenancy)).findFirst().orElseThrow();
    }

    private int unfinishedEvents() {
        return jdbc.queryForObject("SELECT count(*) FROM event_publication WHERE completion_date IS NULL", Integer.class);
    }
}
