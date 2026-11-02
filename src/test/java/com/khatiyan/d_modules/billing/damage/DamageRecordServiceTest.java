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

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.billing.api.dto.DamageRecordResponse;
import com.khatiyan.d_modules.billing.api.dto.RepairDamageRecordRequest;
import com.khatiyan.d_modules.billing.api.dto.SaveDamageRecordRequest;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.support.IntegrationTest;

/**
 * Damage records (2026-10-29) against the real schema: a 3-sharing room with
 * three tenants, an owner who records, charges, edits and repairs.
 */
@IntegrationTest
class DamageRecordServiceTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DamageRecordService damage;
    @Autowired private PropertyModule propertyModule;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID first;
    private UUID second;
    private UUID third;

    @BeforeEach
    void seed() {
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 3, 3);
        first = fx.stay(property, room, fx.appUser(), "ACTIVE", null);
        second = fx.stay(property, room, fx.appUser(), "ACTIVE", null);
        third = fx.stay(property, room, fx.appUser(), "ACTIVE", null);
    }

    @AfterEach
    void remove() throws InterruptedException {
        for (int waited = 0; waited < 50 && unfinishedEvents() > 0; waited++) {
            Thread.sleep(100);
        }
        jdbc.update("DELETE FROM billing.damage_records WHERE property_id = ?", property);
        fx.remove();
    }

    @Test
    void aSplitIsARecordPerTenantWithTheRemainderOnTheFirst() {
        DamageRecordResponse first = damage.create(owner, property, split(100_000L));

        assertThat(first.createdByUserId()).isEqualTo(owner);
        assertThat(first.splitNumber()).isEqualTo(1);
        List<DamageRecordResponse> all = damage.list(owner, property, false);
        assertThat(all).extracting(DamageRecordResponse::code).containsOnly(first.code());
        assertThat(all).extracting(DamageRecordResponse::splitNumber).containsExactly(1, 2, 3);
        assertThat(all).extracting(DamageRecordResponse::costPaise).containsExactly(33_334L, 33_333L, 33_333L);
        assertThat(all).allSatisfy(record -> assertThat(record.shares()).hasSize(1));
        assertThat(all).extracting(record -> record.shares().get(0).tenancyId()).doesNotHaveDuplicates();
    }

    @Test
    void chargingOneSplitBillsOnlyThatTenantUnderItsNumber() {
        damage.create(owner, property, split(90_000L));
        List<DamageRecordResponse> all = damage.list(owner, property, false);

        DamageRecordResponse charged = damage.charge(owner, property, all.get(1).id());

        assertThat(charged.shares().get(0).billId()).isNotNull();
        assertThat(damage.list(owner, property, false)).filteredOn(DamageRecordResponse::charged).hasSize(1);
    }

    @Test
    void chargeNowBillsEverySplitInOneStep() {
        SaveDamageRecordRequest request = split(90_000L);
        damage.create(owner, property, new SaveDamageRecordRequest(request.roomId(), request.itemName(), request.section(),
                request.damageLevel(), request.costPaise(), request.note(), request.photoUrls(), request.responsibility(), null, true));

        assertThat(damage.list(owner, property, false)).hasSize(3).allMatch(DamageRecordResponse::charged);
    }

    @Test
    void aSplitCanChangeItsOwnCostButNotTheSharedItem() {
        damage.create(owner, property, split(90_000L));
        DamageRecordResponse second = damage.list(owner, property, false).get(1);
        SaveDamageRecordRequest request = split(90_000L);

        DamageRecordResponse changed = damage.update(owner, property, second.id(), new SaveDamageRecordRequest(request.roomId(),
                request.itemName(), request.section(), request.damageLevel(), 10_000L, "paid part", request.photoUrls(), request.responsibility(), null));
        assertThat(changed.costPaise()).isEqualTo(10_000L);
        assertThat(changed.shares().get(0).tenancyId()).isEqualTo(second.shares().get(0).tenancyId());
        assertThat(damage.list(owner, property, false)).extracting(DamageRecordResponse::costPaise).containsExactly(30_000L, 10_000L, 30_000L);

        DamageRecordResponse current = damage.list(owner, property, false).get(1);
        assertThatThrownBy(() -> damage.update(owner, property, current.id(), new SaveDamageRecordRequest(request.roomId(),
                "Another item", request.section(), request.damageLevel(), 10_000L, null, request.photoUrls(), request.responsibility(), null)))
                .hasMessageContaining("one split");
    }

    @Test
    void deletingOneSplitLeavesTheOthers() {
        damage.create(owner, property, split(90_000L));
        damage.delete(owner, property, damage.list(owner, property, false).get(0).id());

        assertThat(damage.list(owner, property, false)).extracting(DamageRecordResponse::splitNumber).containsExactly(2, 3);
    }

    @Test
    void fixingTheItemFixesEverySplit() {
        damage.create(owner, property, split(90_000L));
        DamageRecordResponse any = damage.list(owner, property, false).get(2);

        damage.replace(owner, property, any.id(), new RepairDamageRecordRequest(DamageLevel.NA, List.of("fixed.jpg"), "new one"));

        assertThat(damage.list(owner, property, false)).isEmpty();
        assertThat(damage.list(owner, property, true)).hasSize(3)
                .allMatch(record -> record.status() == DamageRecordStatus.REPLACED);
    }

    @Test
    void chargeRaisesOneBillPerShareAndOnlyOnce() {
        DamageRecordResponse record = damage.create(owner, property, split(90_000L));

        DamageRecordResponse charged = damage.charge(owner, property, record.id());

        assertThat(charged.charged()).isTrue();
        assertThat(charged.shares()).allSatisfy(share -> {
            assertThat(share.billCode()).startsWith("BIL-");
            assertThat(share.billStatus()).isEqualTo("UNPAID");
        });
        assertThat(oneOffBills()).isEqualTo(1);
        assertThatThrownBy(() -> damage.charge(owner, property, record.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already charged");
    }

    @Test
    void changingTheAmountCancelsTheUnpaidBillAndLeavesItToChargeAgain() {
        DamageRecordResponse record = damage.create(owner, property, one(first, 150_000L));
        UUID bill = damage.charge(owner, property, record.id()).shares().get(0).billId();
        // An overdue bill is still unpaid: it is cancelled, never locked.
        jdbc.update("UPDATE billing.billing_cycles SET status = 'OVERDUE' WHERE id = ?", bill);

        DamageRecordResponse edited = damage.update(owner, property, record.id(), one(first, 120_000L));

        assertThat(status(bill)).isEqualTo("CANCELLED");
        assertThat(edited.charged()).isFalse();
        assertThat(edited.shares().get(0).billId()).isNull();
        assertThat(edited.costPaise()).isEqualTo(120_000L);
    }

    @Test
    void aPaidBillLocksItsOwnSplitAndLeavesTheOthers() {
        DamageRecordResponse record = damage.create(owner, property, split(90_000L));
        UUID bill = damage.charge(owner, property, record.id()).shares().get(0).billId();
        jdbc.update("UPDATE billing.billing_cycles SET status = 'PAID' WHERE id = ?", bill);

        assertThatThrownBy(() -> damage.update(owner, property, record.id(), split(80_000L)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("paid");
        assertThatThrownBy(() -> damage.delete(owner, property, record.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("paid");
        assertThat(damage.list(owner, property, false)).extracting(DamageRecordResponse::locked).containsExactly(true, false, false);
    }

    @Test
    void deletingCancelsTheUnpaidBill() {
        DamageRecordResponse record = damage.create(owner, property, one(second, 50_000L));
        UUID bill = damage.charge(owner, property, record.id()).shares().get(0).billId();

        damage.delete(owner, property, record.id());

        assertThat(status(bill)).isEqualTo("CANCELLED");
        assertThat(damage.list(owner, property, false)).isEmpty();
    }

    @Test
    void whatTheMoveInChecklistFoundIsNeverCharged() {
        damage.recordFoundAtMoveIn(property, room, owner, List.of(
                new DamageRecordService.FoundDamage("Bucket", "BATHROOM", DamageLevel.D1, List.of("b.jpg"))));
        DamageRecordResponse found = damage.list(owner, property, false).get(0);

        assertThat(found.responsibility()).isEqualTo(DamageResponsibility.NONE);
        assertThat(found.source()).isEqualTo(DamageRecordSource.MOVE_IN);
        assertThatThrownBy(() -> damage.charge(owner, property, found.id()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("not charged");
    }

    @Test
    void aRepairLowersTheRoomLevelReplacesItsPhotosAndMovesToHistory() {
        DamageRecordResponse record = damage.create(owner, property, one(first, 150_000L));

        damage.repair(owner, property, record.id(), new RepairDamageRecordRequest(DamageLevel.D1, List.of("fixed.jpg"), "Grille straightened"));

        assertThat(damage.list(owner, property, false)).isEmpty();
        DamageRecordResponse history = damage.list(owner, property, true).get(0);
        assertThat(history.status()).isEqualTo(DamageRecordStatus.REPAIRED);
        assertThat(history.repairedLevel()).isEqualTo(DamageLevel.D1);
        var ac = propertyModule.roomConditions(room).get(0);
        assertThat(ac.level()).isEqualTo(DamageLevel.D1);
        assertThat(ac.photoUrls()).containsExactly("fixed.jpg");
        // A repair must lower the level.
        DamageRecordResponse again = damage.create(owner, property, one(first, 10_000L));
        assertThatThrownBy(() -> damage.repair(owner, property, again.id(),
                new RepairDamageRecordRequest(DamageLevel.D2, List.of("x.jpg"), null)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("below");
    }

    @Test
    void aReplacementSetsTheItemToNa() {
        DamageRecordResponse record = damage.create(owner, property, one(first, 150_000L));

        DamageRecordResponse replaced = damage.replace(owner, property, record.id(),
                new RepairDamageRecordRequest(null, List.of("new.jpg"), "New unit"));

        assertThat(replaced.status()).isEqualTo(DamageRecordStatus.REPLACED);
        assertThat(propertyModule.roomConditions(room).get(0).level()).isEqualTo(DamageLevel.NA);
    }

    @Test
    void pagesAndGlobalCountsFollowChargesAndRepairs() {
        damage.create(owner, property, one(first, 10_000L));
        var billed = damage.create(owner, property, one(second, 10_000L));
        var fixed = damage.create(owner, property, one(third, 10_000L));
        damage.charge(owner, property, billed.id());

        var firstPage = damage.page(owner, property, false, 0, 2);
        var secondPage = damage.page(owner, property, false, 1, 2);
        assertThat(firstPage.openCount()).isEqualTo(3);
        assertThat(firstPage.historyCount()).isZero();
        assertThat(firstPage.notChargedCount()).isEqualTo(2);
        assertThat(firstPage.records().items()).hasSize(2);
        assertThat(firstPage.records().hasNext()).isTrue();
        assertThat(secondPage.records().items()).hasSize(1);
        assertThat(secondPage.records().hasNext()).isFalse();
        assertThat(secondPage.records().items()).extracting(DamageRecordResponse::id)
                .doesNotContainAnyElementsOf(firstPage.records().items().stream().map(DamageRecordResponse::id).toList());

        damage.repair(owner, property, fixed.id(), new RepairDamageRecordRequest(DamageLevel.D1, List.of("fixed.jpg"), "Fixed"));
        var history = damage.page(owner, property, true, 0, 10);
        assertThat(history.openCount()).isEqualTo(2);
        assertThat(history.historyCount()).isEqualTo(1);
        assertThat(history.notChargedCount()).isEqualTo(1);
        assertThat(history.records().items()).extracting(DamageRecordResponse::id).containsExactly(fixed.id());
    }

    @Test
    void theTenantMustLiveInThatRoom() {
        UUID otherRoom = fx.room(property, 1, 1);
        UUID elsewhere = fx.stay(property, otherRoom, fx.appUser(), "ACTIVE", null);

        assertThatThrownBy(() -> damage.create(owner, property, one(elsewhere, 10_000L)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("living in this room");
    }

    @Test
    void aSmallerDamageNeverLowersTheRoomLevel() {
        damage.create(owner, property, one(first, 150_000L));
        damage.create(owner, property, new SaveDamageRecordRequest(room, "AC", "ROOM", DamageLevel.D1, 5_000L,
                null, List.of("d1.jpg"), DamageResponsibility.TENANT, second));

        assertThat(propertyModule.roomConditions(room).get(0).level()).isEqualTo(DamageLevel.D2);
    }

    @Test
    void theTenantSeesOnlyRecordsNamingTheirStay() {
        damage.create(owner, property, one(first, 150_000L));
        damage.create(owner, property, split(30_000L));

        assertThat(damage.listForTenancy(owner, first)).hasSize(2);
        assertThat(damage.listForTenancy(owner, second)).hasSize(1);
    }

    private SaveDamageRecordRequest one(UUID tenancy, long costPaise) {
        return new SaveDamageRecordRequest(room, "AC", "ROOM", DamageLevel.D2, costPaise, "Grille bent",
                List.of("ac.jpg"), DamageResponsibility.TENANT, tenancy);
    }

    private SaveDamageRecordRequest split(long costPaise) {
        return new SaveDamageRecordRequest(room, "Cupboard", "ROOM", DamageLevel.D3, costPaise, "Door broken",
                List.of("c.jpg"), DamageResponsibility.SPLIT, null);
    }

    private int oneOffBills() {
        return jdbc.queryForObject("SELECT count(*) FROM billing.billing_cycles WHERE property_id = ? AND cycle_number IS NULL",
                Integer.class, property);
    }

    private String status(UUID bill) {
        return jdbc.queryForObject("SELECT status FROM billing.billing_cycles WHERE id = ?", String.class, bill);
    }

    private int unfinishedEvents() {
        return jdbc.queryForObject("SELECT count(*) FROM event_publication WHERE completion_date IS NULL", Integer.class);
    }
}
