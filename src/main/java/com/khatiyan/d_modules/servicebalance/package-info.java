/**
 * The owner's prepaid Service balance: money paid in advance for Khatiyan's own
 * paid services, and every movement of it.
 *
 * <p><b>This balance is closed by design.</b> It buys Khatiyan services only. It
 * cannot be withdrawn to a bank account, transferred to another person, spent on
 * rent or deposits, or paid out to a third party. Those properties are what keep
 * it a closed-system prepaid instrument, which RBI does not treat as a payment
 * system requiring authorisation. Money can leave only the way it came in — a
 * refund to the original payment method — and nothing in this module may offer
 * any other exit.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.khatiyan.d_modules.servicebalance;
