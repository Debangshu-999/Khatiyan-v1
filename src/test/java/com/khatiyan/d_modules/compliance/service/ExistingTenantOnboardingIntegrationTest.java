package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.compliance.ComplianceModule;
import com.khatiyan.d_modules.compliance.api.dto.OnboardExistingTenantRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardExistingTenantRequest.AgreementKind;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.AgreementTermInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest.TenantDetailsInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;
import com.khatiyan.d_modules.compliance.model.LegalStatement;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.IdCheckDeclarationInput;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.IdDocumentType;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;
import com.khatiyan.support.IntegrationTest;

/**
 * Existing-tenant onboarding (P1.1, 2026-10-28), against the real schema: a
 * person who has lived at the property for over a year comes onto Khatiyan
 * from their next bill, with Rs 15,000 deposit already held and Rs 3,000 owed
 * at the switch.
 *
 * <p>On their paper agreement the stay starts at once. On a deed signed in the
 * app it waits for them, and the same things happen when they sign: no deposit
 * on the first bill, the deposit opened as carried over, the dues raised as an
 * opening one-off bill.
 */
@IntegrationTest
class ExistingTenantOnboardingIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ComplianceModule compliance;
    @Autowired private TenancyModule tenancies;
    @Autowired private com.khatiyan.d_modules.tenancy.service.MoveInChecklistService moveInChecklists;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 4, 0);
        tenant = fx.appUser();
    }

    @AfterEach
    void remove() throws InterruptedException {
        for (int waited = 0; waited < 50 && unfinishedEvents() > 0; waited++) {
            Thread.sleep(100);
        }
        jdbc.update("""
                DELETE FROM billing.deposit_movements WHERE deposit_account_id IN
                    (SELECT id FROM billing.deposit_accounts WHERE property_id = ?)""", property);
        jdbc.update("DELETE FROM billing.deposit_accounts WHERE property_id = ?", property);
        fx.remove();
    }

    @Test
    void onTheirPaperAgreementTheStayStartsNowWithItsDepositHeldAndItsDuesBilled() {
        LocalDate movedIn = today.minusMonths(14);
        LocalDate firstBill = today.plusDays(5);

        OnboardTenancyWithAgreementResponse done = compliance.onboardExistingTenant(owner,
                request(AgreementKind.PAPER, movedIn, firstBill, List.of("https://res.cloudinary.com/x/agreement-1.jpg"), null),
                "10.0.0.7", UUID.randomUUID());

        TenancyResponse stay = done.tenancy();
        assertThat(done.agreement()).isNull();
        assertThat(stay.status()).isEqualTo(TenancyStatus.ACTIVE);
        assertThat(stay.transitioned()).isTrue();
        assertThat(stay.movedInOn()).isEqualTo(movedIn);
        assertThat(stay.startDate()).isEqualTo(firstBill);
        assertThat(stay.agreementOnPaper()).isTrue();
        assertThat(stay.paperAgreementPhotoUrls()).containsExactly("https://res.cloudinary.com/x/agreement-1.jpg");
        assertThat(stay.depositAmountPaise()).isEqualTo(1_500_000L);
        // The remaining term counts from the first Khatiyan bill.
        assertThat(stay.agreementEndDate()).isEqualTo(firstBill.plusMonths(6));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM compliance.tenancy_agreements WHERE tenancy_id = ?",
                Integer.class, stay.id())).isZero();

        assertCarriedOverBilling(stay.id(), firstBill);
    }

    @Test
    void onADeedSignedInTheAppTheStayWaitsAndCarriesOverWhenTheySign() {
        LocalDate movedIn = today.minusYears(2);

        OnboardTenancyWithAgreementResponse done = compliance.onboardExistingTenant(owner,
                request(AgreementKind.IN_APP, movedIn, today, null, address()), "10.0.0.7", UUID.randomUUID());

        TenancyResponse stay = done.tenancy();
        assertThat(stay.status()).isEqualTo(TenancyStatus.PENDING_ACCEPTANCE);
        assertThat(stay.transitioned()).isTrue();
        assertThat(stay.agreementOnPaper()).isFalse();
        assertThat(done.agreement()).isNotNull();
        // Nothing is billed until they sign.
        assertThat(bills(stay.id())).isZero();

        tenancies.acceptTermsAndActivate(stay.id(), tenant);

        assertCarriedOverBilling(stay.id(), today);
    }

    @Test
    void theDatesMustDescribeSomeoneAlreadyLivingHere() {
        // Moved in after the first Khatiyan bill.
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                request(AgreementKind.PAPER, today.plusDays(2), today.plusDays(1), photo(), null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("move-in date");
        // A first bill more than a month away is not their next rent day.
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                request(AgreementKind.PAPER, today.minusMonths(3), today.plusDays(40), photo(), null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("first Khatiyan bill");
        // Keeping the paper agreement means having it on file.
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                request(AgreementKind.PAPER, today.minusMonths(3), today, List.of(), null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Add the paper agreement");
        // A deed signed in the app names them by their address.
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                request(AgreementKind.IN_APP, today.minusMonths(3), today, null, null), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tenancy.tenancies WHERE property_id = ?",
                Integer.class, property)).isZero();
    }

    /** The first bill has rent and no deposit, the deposit is held as carried over, and the dues are billed. */
    @Test
    void anOwnerMayDeclareTheirIdentityWasVerifiedBeforeKhatiyan() {
        String statement = LegalStatement.EXISTING_TENANT_VERIFIED_DECLARATION.text();

        // Never beside a check made now, and only in the words the server shows.
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                verifiedBefore(new IdCheckDeclarationInput(true, IdDocumentType.AADHAAR, "4821", Gender.FEMALE,
                        LocalDate.of(2000, 1, 1)), statement), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Choose one way");
        assertThatThrownBy(() -> compliance.onboardExistingTenant(owner,
                verifiedBefore(null, "Some other words"), "10.0.0.7", UUID.randomUUID()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("outdated declaration");

        TenancyResponse stay = compliance.onboardExistingTenant(owner,
                verifiedBefore(null, statement), "10.0.0.7", UUID.randomUUID()).tenancy();

        assertThat(stay.status()).isEqualTo(TenancyStatus.ACTIVE);
        assertThat(stay.verifiedBeforeKhatiyan()).isTrue();
        assertThat(stay.idCheckConfirmed()).isNotEqualTo(Boolean.TRUE);
        assertThat(jdbc.queryForList("SELECT kind FROM compliance.attestations WHERE subject_id = ?",
                String.class, stay.id())).containsExactly("EXISTING_TENANT_VERIFIED_DECLARATION");
    }

    @Test
    void theMoveInChecklistIsRecordedWithTheStayAndAnsweredByTheTenant() {
        // The room's condition at the switch (user, 2026-10-29): levels, photos, keys.
        var checklist = new com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput(
                List.of(
                        new com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput.ItemInput(
                                "Mattress", com.khatiyan.d_modules.property.model.DamageLevel.NA, null, false,
                                List.of("https://res.cloudinary.com/x/mattress.jpg"),
                                com.khatiyan.d_modules.tenancy.model.MoveInSection.ROOM),
                        new com.khatiyan.d_modules.tenancy.api.dto.MoveInChecklistInput.ItemInput(
                                "Study lamp", com.khatiyan.d_modules.property.model.DamageLevel.D1, " Scratched base ", true,
                                List.of("https://res.cloudinary.com/x/lamp-1.jpg", "https://res.cloudinary.com/x/lamp-2.jpg"),
                                null)),
                2);
        OnboardExistingTenantRequest plain = request(AgreementKind.PAPER, today.minusMonths(5), today.plusDays(3), photo(), null);
        OnboardExistingTenantRequest withChecklist = new OnboardExistingTenantRequest(
                plain.tenantPhone(), plain.tenantName(), plain.propertyId(), plain.roomId(), plain.rentAmountPaise(),
                plain.depositHeldPaise(), plain.movedInOn(), plain.firstBillOn(), plain.openingDuesPaise(),
                plain.openingDuesNote(), plain.idCheck(), plain.idCheckStatementText(), plain.verification(),
                plain.verifiedBefore(), plain.verifiedBeforeStatementText(), plain.device(), plain.tenant(),
                plain.agreement(), plain.paperAgreementPhotoUrls(), plain.template(), plain.term(), checklist,
                List.of(" Keys returned ", "Wardrobe emptied", "Keys returned"));
        UUID stay = compliance.onboardExistingTenant(owner, withChecklist, "10.0.0.7", UUID.randomUUID()).tenancy().id();

        // Its own move-out checklist, cleaned of blanks and repeats (user, 2026-10-29).
        assertThat(tenancies.findById(stay).orElseThrow().moveOutChecklist())
                .containsExactly("Keys returned", "Wardrobe emptied");

        var asOwner = moveInChecklists.get(owner, stay);
        assertThat(asOwner.items()).extracting(item -> item.name() + ":" + item.damageLevel() + ":" + item.note())
                .containsExactly("Mattress:NA:null", "Study lamp:D1:Scratched base");
        assertThat(asOwner.items().get(1).custom()).isTrue();
        // A section that is not sent is Room.
        assertThat(asOwner.items().get(1).section()).isEqualTo(com.khatiyan.d_modules.tenancy.model.MoveInSection.ROOM);
        assertThat(asOwner.items().get(1).photoUrls()).hasSize(2);
        // What each level means at this property, for whoever reads it.
        assertThat(asOwner.levels()).extracting(level -> level.level().name()).containsExactly("NA", "D1", "D2", "D3");
        assertThat(asOwner.keysHandedOver()).isEqualTo(2);
        assertThat(asOwner.status()).isEqualTo("PENDING");
        assertThat(asOwner.canRespond()).isFalse();
        assertThat(moveInChecklists.get(tenant, stay).canRespond()).isTrue();

        // Only the tenant answers, once, and a difference needs words.
        assertThatThrownBy(() -> moveInChecklists.respond(owner, stay, true, null))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> moveInChecklists.respond(tenant, stay, false, " "))
                .isInstanceOf(ValidationException.class).hasMessageContaining("what is different");
        var answered = moveInChecklists.respond(tenant, stay, false, "The fan was already broken");
        assertThat(answered.status()).isEqualTo("NOTED");
        assertThat(answered.tenantNote()).isEqualTo("The fan was already broken");
        assertThatThrownBy(() -> moveInChecklists.respond(tenant, stay, true, null))
                .isInstanceOf(ValidationException.class).hasMessageContaining("already answered");
    }

    @Test
    void anUnansweredChecklistCountsAsAcceptedAfter48Hours() {
        java.time.Instant at = java.time.Instant.parse("2026-10-29T06:00:00Z");
        var checklist = com.khatiyan.d_modules.tenancy.model.MoveInChecklist.record(UUID.randomUUID(), owner, at,
                List.of(new com.khatiyan.d_modules.tenancy.model.MoveInChecklistItem(
                        "Mattress", com.khatiyan.d_modules.property.model.DamageLevel.D2, "Torn corner", false,
                        List.of("https://res.cloudinary.com/x/mattress.jpg"))), 1);
        // Damage above NA needs its note.
        assertThatThrownBy(() -> new com.khatiyan.d_modules.tenancy.model.MoveInChecklistItem(
                "Kettle", com.khatiyan.d_modules.property.model.DamageLevel.D1, " ", false, List.of("k.jpg")))
                .isInstanceOf(ValidationException.class).hasMessageContaining("Describe the damage to Kettle");
        assertThat(checklist.acceptedByDefault(at.plusSeconds(47 * 3600))).isFalse();
        assertThat(checklist.acceptedByDefault(at.plusSeconds(49 * 3600))).isTrue();
        assertThatThrownBy(() -> checklist.respond(true, null, at.plusSeconds(49 * 3600)))
                .isInstanceOf(ValidationException.class).hasMessageContaining("48 hours");
        // Every item needs a photo, and at most 3.
        assertThatThrownBy(() -> new com.khatiyan.d_modules.tenancy.model.MoveInChecklistItem(
                "Mattress", com.khatiyan.d_modules.property.model.DamageLevel.NA, null, false, List.of()))
                .isInstanceOf(ValidationException.class).hasMessageContaining("photo of Mattress");
        assertThatThrownBy(() -> new com.khatiyan.d_modules.tenancy.model.MoveInChecklistItem(
                "Mattress", com.khatiyan.d_modules.property.model.DamageLevel.NA, null, false,
                List.of("a", "b", "c", "d"))).isInstanceOf(ValidationException.class).hasMessageContaining("at most 3");
    }

    @Test
    void damageLevelsArePricedPerItemAndNeverCheaperWhenWorse() {
        var kettle = com.khatiyan.d_modules.property.model.PropertyDamageCharge.of("Kettle", 20_000L, 50_000L, 100_000L);
        assertThat(kettle.priceAt(com.khatiyan.d_modules.property.model.DamageLevel.NA)).isZero();
        assertThat(kettle.priceAt(com.khatiyan.d_modules.property.model.DamageLevel.D2)).isEqualTo(50_000L);
        // The one flat amount the deed still prints is D3's.
        assertThat(kettle.getChargePaise()).isEqualTo(100_000L);
        assertThatThrownBy(() -> com.khatiyan.d_modules.property.model.PropertyDamageCharge.of("Kettle", 60_000L, 50_000L, 100_000L))
                .isInstanceOf(ValidationException.class).hasMessageContaining("cannot cost less");
        // One to three levels: D3 needs D2, and the flat amount is the highest priced (user, 2026-10-29).
        var lamp = com.khatiyan.d_modules.property.model.PropertyDamageCharge.of("Lamp", 10_000L, 25_000L, null);
        assertThat(lamp.getChargePaise()).isEqualTo(25_000L);
        assertThat(lamp.priceAt(com.khatiyan.d_modules.property.model.DamageLevel.D3)).isNull();
        assertThatThrownBy(() -> com.khatiyan.d_modules.property.model.PropertyDamageCharge.of("Lamp", 10_000L, null, 30_000L))
                .isInstanceOf(ValidationException.class).hasMessageContaining("D2 before D3");
        // On the list, not priced yet: charged nothing (the damage list drives the move-in checklist).
        var mug = com.khatiyan.d_modules.property.model.PropertyDamageCharge.unpriced("Mug",
                com.khatiyan.d_modules.property.model.DamageCategory.BATHROOM);
        assertThat(mug.isPriced()).isFalse();
        assertThat(mug.getChargePaise()).isZero();
    }

    private void assertCarriedOverBilling(UUID tenancyId, LocalDate firstBill) {
        assertThat(jdbc.queryForList("""
                SELECT l.type FROM billing.billing_cycle_line_items l
                JOIN billing.billing_cycles c ON c.id = l.billing_cycle_id
                WHERE c.tenancy_id = ? AND c.cycle_number = 1""", String.class, tenancyId))
                .containsExactly("RENT");
        assertThat(jdbc.queryForObject(
                "SELECT period_start_date FROM billing.billing_cycles WHERE tenancy_id = ? AND cycle_number = 1",
                LocalDate.class, tenancyId)).isEqualTo(firstBill);
        assertThat(jdbc.queryForList("""
                SELECT m.reason FROM billing.deposit_movements m
                JOIN billing.deposit_accounts a ON a.id = m.deposit_account_id
                WHERE a.tenancy_id = ? AND m.amount_paise = 1500000""", String.class, tenancyId))
                .containsExactly("Deposit carried over from before Khatiyan");
        assertThat(jdbc.queryForList("""
                SELECT c.total_amount_paise FROM billing.billing_cycles c
                WHERE c.tenancy_id = ? AND c.category = 'ONE_OFF'""", Long.class, tenancyId))
                .containsExactly(300_000L);
    }

    private OnboardExistingTenantRequest request(
            AgreementKind kind, LocalDate movedIn, LocalDate firstBill, List<String> photos, TenantDetailsInput details) {
        return new OnboardExistingTenantRequest(
                fx.phoneOf(tenant), "Ritu Sen", property, room,
                900_000L, 1_500_000L,
                movedIn, firstBill,
                300_000L, "Rent for October",
                new IdCheckDeclarationInput(true, IdDocumentType.AADHAAR, "4821", Gender.FEMALE, LocalDate.of(2000, 1, 1)),
                LegalStatement.TENANT_ID_DECLARATION.text(), null, null, null, null,
                details, kind, photos, null,
                new AgreementTermInput(6, null));
    }

    /** The same stay, its identity declared as verified before Khatiyan instead of checked now. */
    private OnboardExistingTenantRequest verifiedBefore(IdCheckDeclarationInput idCheck, String statement) {
        LocalDate firstBill = today.plusDays(5);
        return new OnboardExistingTenantRequest(
                fx.phoneOf(tenant), "Ritu Sen", property, room,
                900_000L, 1_500_000L,
                today.minusMonths(8), firstBill,
                null, null,
                idCheck, idCheck == null ? null : LegalStatement.TENANT_ID_DECLARATION.text(), null,
                true, statement, null,
                null, AgreementKind.PAPER, photo(), null,
                new AgreementTermInput(6, null));
    }

    private static TenantDetailsInput address() {
        return new TenantDetailsInput("14 Park Street, Kolkata", "700016", LocalDate.of(2000, 1, 1), Gender.FEMALE);
    }

    private static List<String> photo() {
        return List.of("https://res.cloudinary.com/x/agreement-1.jpg");
    }

    private int bills(UUID tenancyId) {
        return jdbc.queryForObject("SELECT count(*) FROM billing.billing_cycles WHERE tenancy_id = ?", Integer.class, tenancyId);
    }

    private int unfinishedEvents() {
        try {
            return jdbc.queryForObject("SELECT count(*) FROM event_publication WHERE completion_date IS NULL",
                    Integer.class);
        } catch (RuntimeException unreadable) {
            return 0;
        }
    }
}
