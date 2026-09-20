/**
 * Proving a tenant is who they say they are, through a licensed provider.
 *
 * <p><b>The owner orders, the tenant performs.</b> An owner chooses which
 * checks a tenancy needs and how many tries the tenant gets. The tenant then
 * does each check from their own phone. At no point does an owner or a manager
 * see an Aadhaar number, an OTP, or anything else the tenant types — that
 * separation is the product, not an implementation detail, and nothing in this
 * module may put those values on a screen an owner can reach.
 *
 * <p><b>What survives a check is deliberately thin.</b> The masked last four,
 * the name and date of birth returned, and whether they matched what the
 * tenancy already said. Never the full Aadhaar number, never the signed XML,
 * never the photo, never the raw provider response. UIDAI's offline
 * verification framework requires the number to be masked or redacted, and the
 * cheapest way to honour that is to never hold it in the first place.
 *
 * <p><b>Khatiyan pays the provider, not the owner.</b> We keep our own prepaid
 * balance with them, so a check runs regardless of what the owner's Service
 * balance says. That balance records the consumption afterwards. Every limit
 * that can refuse an owner therefore lives at the moment they ORDER checks,
 * never at the moment a tenant runs one — refusing a tenant mid-OTP would
 * strand a person and lose us the money anyway.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.khatiyan.d_modules.verification;
