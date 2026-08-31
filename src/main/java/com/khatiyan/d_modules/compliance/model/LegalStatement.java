package com.khatiyan.d_modules.compliance.model;

/**
 * The exact words somebody is asked to agree to.
 *
 * <p>Held on the server, not in the app. The record of a declaration is only
 * worth having if it can be shown that the person saw <em>these</em> words, and
 * a string shipped inside a mobile build is a string the person's own copy of
 * the app decided to show. The client renders what this returns and sends it
 * back to be stored verbatim; the server checks the two agree before recording
 * anything.
 *
 * <p><b>Versioned, and versions are never edited.</b> Reworded text gets a new
 * version and the old one stays exactly as it was, because a declaration made in
 * March was made against March's wording. Editing a version in place would
 * silently restate what every earlier signatory agreed to.
 *
 * <p><b>Not legal advice.</b> This wording is drafting input and needs review by
 * a qualified Indian lawyer before it goes live. The obligations it allocates —
 * tenant identity verification, police notification — are dealt with at more
 * length in docs/tnc-clauses-pending.md.
 */
public enum LegalStatement {

    /**
     * Shown to the tenant above the consent checkbox, before the OTP step.
     *
     * <p><b>Says "electronic assent", never "digital signature".</b> Those are
     * different things in the IT Act and the difference is not pedantry. A
     * digital signature (s.2(1)(p), s.3) is asymmetric cryptography with a
     * certificate from a licensed CA. An electronic signature (s.3A, Second
     * Schedule) is a notified technique, which in practice means Aadhaar eKYC
     * OTP routed through a licensed eSign provider. An OTP sent by this app is
     * neither. What it is, is evidence of assent — and s.10A makes a contract
     * formed that way enforceable, which is all this needs.
     *
     * <p>Claiming more would be telling the tenant their act has a legal
     * character it does not have, and handing anyone disputing the agreement a
     * misrepresentation argument against the whole record. The narrower claim is
     * the stronger one.
     */
    TENANCY_AGREEMENT_ACCEPTANCE(
            1,
            """
            I confirm that I have reviewed and understood the tenancy terms, rules, rent, \
            deposit and billing details displayed above, and that I accept them.

            I agree that ticking this box and entering the One-Time Password sent to my \
            registered mobile number constitutes my valid and binding electronic assent to \
            this agreement. I understand that this agreement is enforceable notwithstanding \
            that it was formed by electronic means, under Section 10A of the Information \
            Technology Act, 2000.

            My tenancy and its billing begin only after this step.

            I acknowledge that Khatiyan acts strictly as an electronic record repository and \
            cloud bookkeeping utility. Khatiyan does not draft these clauses, does not check \
            them against rent control or other local law, and does not carry out stamping or \
            registration. Ensuring that this agreement is duly stamped and enforceable in a \
            court of law remains entirely with me and the Property Owner.

            To record that I gave this assent, Khatiyan will store the date and time, my \
            internet address, my device details, my signed-in session, the result of the \
            One-Time Password check, and a cryptographic fingerprint of the exact agreement \
            text shown to me. This record is kept as evidence of this assent and retained for \
            as long as needed to resolve any dispute about it.

            If anything above is wrong, I should not continue. I can contact the Property \
            Owner, or decline to cancel this tenancy.\
            """),

    /**
     * Shown to the owner or manager at the end of onboarding.
     *
     * <p>First person throughout, so the record is of their statement rather
     * than of a box in our product.
     *
     * <p><b>"I have physically met this tenant" is safe to assert</b> because
     * the business flow cannot happen any other way — the first rent payment and
     * the handover of keys both put the two in the same room. A clause that
     * manufactures false declarations at scale would be worse than a weaker one,
     * so this holds only as long as that stays true. Remote onboarding would
     * require rewording it.
     *
     * <p><b>The voluntariness sentence is about the tenant's CHOICE OF
     * DOCUMENT</b>, not about whether the declaration is optional — it is not,
     * onboarding will not complete without it. The point it carries is the one
     * that matters legally: no particular document was demanded, which is what
     * keeps this clear of requiring Aadhaar. A private landlord cannot demand
     * Aadhaar; s.57 of the Aadhaar Act was struck down in Puttaswamy.
     *
     * <p><b>TODO — move the indemnity to the app-wide terms once they exist</b>
     * and merely reference it here. An indemnity given in a per-tenancy checkbox,
     * with no consideration flowing at that moment, is weaker than the same words
     * in terms accepted at signup. It sits here only because there is nowhere
     * better to put it yet.
     */
    TENANT_ID_DECLARATION(
            1,
            """
            I solemnly declare that I have physically met this tenant, that I have seen the \
            original of the government-issued identification document selected above, and \
            that the last four digits recorded above are taken from that document. I confirm \
            that I have satisfied myself that the photograph on that document is of the tenant.

            I confirm that the tenant chose which identification document to produce, and was \
            not required by me to produce any particular one.

            I acknowledge that Khatiyan does not conduct physical background checks, does not \
            cross-verify any government database, holds no copy of the document I have \
            checked, and does not vouch for this tenant's identity or legal background. This \
            record is my own declaration and nothing more.

            I accept that verifying tenant identity, and complying with state-mandated police \
            tenant verification and registration requirements, is my sole responsibility as \
            the landlord or the landlord's agent. I understand that a false declaration or a \
            failure to comply may expose me to liability, including under Section 188 of the \
            Indian Penal Code where my state imposes such a duty.

            I agree to indemnify and hold harmless Khatiyan, its operators and its directors \
            against any claim, statutory liability or dispute arising out of this tenancy or \
            out of this declaration.

            To record that I made this declaration, Khatiyan will store the date and time, my \
            internet address, my device details, my signed-in session, and a cryptographic \
            fingerprint of this declaration.\
            """);

    private final int version;
    private final String text;

    LegalStatement(int version, String text) {
        this.version = version;
        this.text = text;
    }

    public int version() {
        return this.version;
    }

    /** The wording as shown. Whitespace is significant: it is hashed as-is. */
    public String text() {
        return this.text;
    }

    /** The stable identifier stored on the record, independent of the enum's ordinal. */
    public String key() {
        return name();
    }
}
