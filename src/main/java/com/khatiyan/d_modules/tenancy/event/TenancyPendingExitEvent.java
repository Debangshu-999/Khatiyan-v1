package com.khatiyan.d_modules.tenancy.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Published when a stay passes its checkout date with nobody having ended it,
 * and becomes PENDING_EXIT. The bed stays held; everything else halts.
 *
 * <p>Listeners: food ends the subscription, notification tells both sides. It is
 * NOT an ending: nothing listening may release the bed or settle the deposit.
 * {@code userId} is null on a guest stay.
 */
public record TenancyPendingExitEvent(
    UUID tenancyId,
    UUID userId,
    UUID propertyId,
    UUID roomId,
    LocalDate checkoutDate
) {}
