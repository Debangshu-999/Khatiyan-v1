package com.khatiyan.d_modules.staff.model;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A common manual salary ledger for either a manager assignment or a non-user
 * staff member. The database constraint enforces exactly one owner.
 */
@Entity
@Table(name = "salary_accounts", schema = "staff")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SalaryAccount extends BaseEntity {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "reference_code", nullable = false, updatable = false)
    private String referenceCode;

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "property_manager_id")
    private UUID propertyManagerId;

    @Column(name = "staff_member_id")
    private UUID staffMemberId;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "opened_on", nullable = false, updatable = false)
    private LocalDate openedOn;

    @Column(name = "settled_on")
    private LocalDate settledOn;

    // Final additional amount paid at settlement, on top of clearing unpaid
    // months (e.g. gratuity / final dues). Set only when the account is settled.
    @Column(name = "settlement_amount_paise", nullable = false)
    private long settlementAmountPaise;

    private SalaryAccount(String referenceCode, UUID propertyId, UUID propertyManagerId, UUID staffMemberId, LocalDate openedOn) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.propertyId = propertyId;
        this.propertyManagerId = propertyManagerId;
        this.staffMemberId = staffMemberId;
        this.openedOn = openedOn;
        this.active = true;
        this.settlementAmountPaise = 0;
    }

    public static SalaryAccount forManager(String referenceCode, UUID propertyId, UUID managerId, LocalDate openedOn) {
        return new SalaryAccount(referenceCode, propertyId, managerId, null, openedOn);
    }

    public static SalaryAccount forStaffMember(String referenceCode, UUID propertyId, UUID staffMemberId, LocalDate openedOn) {
        return new SalaryAccount(referenceCode, propertyId, null, staffMemberId, openedOn);
    }

    public void settle(LocalDate settledOn, long settlementAmountPaise) {
        this.active = false;
        this.settledOn = settledOn;
        this.settlementAmountPaise = settlementAmountPaise;
    }
}
