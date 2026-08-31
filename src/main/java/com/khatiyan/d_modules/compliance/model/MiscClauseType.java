package com.khatiyan.d_modules.compliance.model;

/**
 * The opt-in clause library: platform-authored terms an owner can tick.
 *
 * <p>Unlike the main run these carry their own words here, because none of them
 * has a slot — they say the same thing on every agreement in the country, which
 * is exactly why they can be a shared library rather than something each owner
 * writes badly for themselves.
 *
 * <p>Selected clauses follow the whole main run under their own heading, numbered
 * from 1 again, in the order they were ticked. They are never spliced into the
 * main run and never continue its numbering: a term the owner opted into is not
 * one of the terms the deed is built from, and numbering it 16 would present it
 * as an equal part of the same instrument.
 *
 * <p>Several of these overlap terms in the main run — the deposit deduction, the
 * utility split, the furniture damage rule. That is the owner's call to make, not
 * ours to prevent: they are ticking a stricter or more specific version of
 * something the main run states generally.
 */
public enum MiscClauseType {

    PROPERTY_CONDITION_ON_VACATING(
            "Property condition upon vacating",
            "Upon vacating the Premises, the Tenant is required to return the property in a clean condition,"
                    + " similar to the condition at move-in. If the Landlord deems that the Premises require"
                    + " additional cleaning or repainting beyond normal wear and tear, the Landlord will deduct"
                    + " the associated cleaning and painting costs."),

    PAINTING_AND_CLEANING_CHARGES(
            "Painting and cleaning charges",
            "On conclusion of the agreement and vacating the Premises, the Tenant has agreed to a deduction of"
                    + " one month's rent from the deposit towards painting and cleaning charges."),

    ELECTRICITY_AND_WATER_CHARGES(
            "Electricity and water charges",
            "The Tenant shall be responsible for the payment of all electricity and water bills associated with"
                    + " the Premises during the stay."),

    FURNITURE_NO_ALTERATIONS(
            "Furniture — no alterations",
            "The Tenant shall not make any alterations to the furniture, including but not limited to painting,"
                    + " reupholstering, or disassembling, without the Landlord's written consent."),

    FURNITURE_DAMAGE_LIABILITY(
            "Furniture — damage liability",
            "In the event of damage caused by the Tenant, the Tenant shall be liable for the cost of repair or"
                    + " replacement of the damaged furniture or furnishings."),

    REFUNDABLE_DEPOSIT_CLEANING(
            "Refundable deposit — cleaning and painting",
            "The Landlord may deduct reasonable cleaning and painting costs from the Tenant's security deposit"
                    + " if the Premises are not returned in a satisfactory condition."),

    SECURITY_ILLEGAL_ACTIVITY(
            "Security",
            "This agreement can be cancelled immediately by the Landlord if the Tenant is found guilty of"
                    + " conducting any illegal activity on the Premises."),

    PETS_NOT_PERMITTED(
            "Pets — none permitted",
            "The Tenant agrees that no additional pets will be kept on the Premises."),

    PETS_DAMAGE_LIABILITY(
            "Pets — damage liability",
            "The Tenant shall be liable for any damage caused by a pet to the Premises, including but not"
                    + " limited to chewing, scratching, or soiling. The Tenant agrees to repair any such damage"
                    + " at their own expense or reimburse the Landlord for the cost of repairs."),

    GST_REGISTRATION_PROHIBITED(
            "Prohibition on GST registration",
            "The Tenant shall not use the Premises to obtain or register for Goods and Services Tax (GST), nor"
                    + " represent it as their principal place of business for GST purposes, without prior"
                    + " written consent from the Landlord. Any such action shall constitute a material breach"
                    + " and may lead to immediate termination of this agreement.");

    private final String heading;
    private final String body;

    MiscClauseType(String heading, String body) {
        this.heading = heading;
        this.body = body;
    }

    public String heading() {
        return heading;
    }

    public String body() {
        return body;
    }
}
