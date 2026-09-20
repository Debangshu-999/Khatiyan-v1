package com.khatiyan.d_modules.billing.model;

import java.util.UUID;

import com.khatiyan.c_shared.audit.BaseEntity;
import com.khatiyan.c_shared.exception.ValidationException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Where a property's rent should be paid to.
 *
 * <p>
 * Entirely optional, per property. An owner collecting only in cash never fills
 * this in, and without a UPI address the tenant is simply never offered a pay
 * link — there is no half-configured state where a link exists but points
 * nowhere.
 *
 * <p>
 * <b>All of it is shown to the tenant</b> — the pay sheet offers UPI and bank
 * transfer as two tabs. An earlier version treated the bank fields as the
 * owner's private reconciliation note; they are payment instructions, and a
 * tenant whose bank app is easier than their UPI app needs them.
 *
 * <p>
 * Note the V6124 migration still describes the bank columns as never shown to a
 * tenant. That comment is stale and cannot be corrected in place — the file is
 * applied, and editing it is a checksum mismatch that refuses to boot. This
 * class is the current record.
 */
@Entity
@Table(name = "property_payment_details", schema = "billing")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PropertyPaymentDetails extends BaseEntity {

    /**
     * A UPI address is {@code name@handle}.
     *
     * <p>
     * Deliberately loose. Handles proliferate faster than any allow-list can
     * track, and refusing a valid address is worse than accepting a typo — the
     * typo surfaces immediately when the tenant's banking app says the payee
     * does not exist, whereas a wrongly-refused address has no way forward.
     */
    private static final String VPA_PATTERN = "^[A-Za-z0-9._%+-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$";

    /** Four letters, a zero, then six alphanumerics — the RBI's IFSC format. */
    private static final String IFSC_PATTERN = "^[A-Z]{4}0[A-Z0-9]{6}$";

    @Id
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "upi_vpa", length = 120)
    private String upiVpa;

    @Column(name = "payee_name", length = 120)
    private String payeeName;

    /**
     * The owner's uploaded UPI QR.
     *
     * <p>
     * Shown to the tenant, unlike the bank fields. It covers the cases a deep
     * link cannot: scanning from a second device, or a banking app that never
     * came to the front when the link fired.
     */
    @Column(name = "upi_qr_image_url", length = 500)
    private String upiQrImageUrl;

    /**
     * The number the owner's UPI is registered against.
     *
     * <p>
     * Ten bare digits, not the {@code +91} form account phones carry — this is
     * shown to a tenant to type into their UPI app, and that is what those apps
     * ask for.
     */
    @Column(name = "upi_phone", length = 10)
    private String upiPhone;

    @Column(name = "bank_account_number", length = 34)
    private String bankAccountNumber;

    @Column(name = "bank_ifsc", length = 11)
    private String bankIfsc;

    @Column(name = "bank_account_holder", length = 120)
    private String bankAccountHolder;

    @Column(name = "updated_by_user_id", nullable = false)
    private UUID updatedByUserId;

    private PropertyPaymentDetails(UUID propertyId) {
        this.propertyId = propertyId;
    }

    public static PropertyPaymentDetails empty(UUID propertyId) {
        return new PropertyPaymentDetails(propertyId);
    }

    /**
     * True when the tenant can be offered payment at all.
     *
     * <p>
     * Any one of the three is enough. An owner who uploads only a QR can still
     * be paid — the tenant scans it — so gating on the address alone would hide
     * the option from a property that is perfectly able to receive money.
     */
    public boolean canAcceptUpi() {
        return notBlank(upiVpa) || notBlank(upiPhone) || notBlank(upiQrImageUrl);
    }

    /**
     * True when a {@code upi://pay} link can be built.
     *
     * <p>
     * Narrower than {@link #canAcceptUpi()}: the link needs an address. With
     * only a QR the tenant scans instead, and there is no link to fire.
     */
    public boolean canBuildPayLink() {
        return notBlank(upiVpa);
    }

    /**
     * Whether the pay sheet has a bank tab to offer.
     *
     * <p>
     * Both halves, because {@code update} already refuses one without the other
     * — a number with no IFSC is not something anyone can transfer to.
     */
    public boolean hasBankDetails() {
        return notBlank(bankAccountNumber) && notBlank(bankIfsc);
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    public void update(
            String upiVpa,
            String payeeName,
            String upiPhone,
            String upiQrImageUrl,
            String bankAccountNumber,
            String bankIfsc,
            String bankAccountHolder,
            UUID actorUserId) {
        String trimmedVpa = trimmedOrNull(upiVpa);
        if (trimmedVpa != null && !trimmedVpa.matches(VPA_PATTERN)) {
            throw new ValidationException("Enter a UPI address like name@bank.");
        }

        String trimmedPhone = trimmedOrNull(upiPhone);
        if (trimmedPhone != null && !trimmedPhone.matches("^[0-9]{10}$")) {
            throw new ValidationException("A UPI phone number is 10 digits.");
        }

        String trimmedIfsc = trimmedOrNull(bankIfsc);
        if (trimmedIfsc != null) {
            trimmedIfsc = trimmedIfsc.toUpperCase();
            if (!trimmedIfsc.matches(IFSC_PATTERN)) {
                throw new ValidationException("An IFSC is 11 characters, like HDFC0001234.");
            }
        }

        String trimmedAccount = trimmedOrNull(bankAccountNumber);
        if (trimmedAccount != null && !trimmedAccount.matches("^[0-9]{6,18}$")) {
            throw new ValidationException("An account number is 6 to 18 digits.");
        }

        // The four UPI details go together, all or none. Each serves a way the
        // tenant pays (the QR from a second device, the address and phone from
        // the phone they hold) and the receiver name is how they check the money
        // goes to the right person. A partial set strands some of those tenants.
        String trimmedQr = trimmedOrNull(upiQrImageUrl);
        String trimmedPayee = trimmedOrNull(payeeName);
        int upiFilled = (trimmedVpa != null ? 1 : 0) + (trimmedPhone != null ? 1 : 0)
                + (trimmedQr != null ? 1 : 0) + (trimmedPayee != null ? 1 : 0);
        if (upiFilled > 0 && upiFilled < 4) {
            throw new ValidationException(
                    "Add the UPI QR code, UPI address, UPI phone number and receiver name together, or leave all of them empty.");
        }

        // Either both halves or neither. A tenant cannot transfer to an account
        // number with no IFSC, so half of one is not a partial answer — it is a
        // bank tab that cannot be acted on.
        if ((trimmedAccount == null) != (trimmedIfsc == null)) {
            throw new ValidationException("Add both the account number and the IFSC, or neither.");
        }

        this.upiVpa = trimmedVpa;
        this.payeeName = trimmedPayee;
        this.upiPhone = trimmedPhone;
        this.upiQrImageUrl = trimmedQr;
        this.bankAccountNumber = trimmedAccount;
        this.bankIfsc = trimmedIfsc;
        this.bankAccountHolder = trimmedOrNull(bankAccountHolder);
        this.updatedByUserId = actorUserId;
    }

    private static String trimmedOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
