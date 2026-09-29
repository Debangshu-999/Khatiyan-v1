package com.khatiyan.d_modules.verification.service;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.tenancy.event.TenancyCancelledEvent;

/**
 * A stay cancelled before it began takes its checks with it.
 *
 * <p>Without this, a check on a cancelled stay stayed PENDING forever and
 * showed up beside the next stay's check on the tenant's screen (seen
 * 2026-09-27). Checks already passed are kept: a completed check is a fact
 * about a person, not a line item.
 *
 * <p>At-least-once, so it must be safe twice: cancelling a cancelled grant
 * changes nothing. No {@code @Transactional} beside the listener annotation,
 * which already composes REQUIRES_NEW.
 */
@Component
public class VerificationTenancyListener {

    private final VerificationService verificationService;

    public VerificationTenancyListener(VerificationService verificationService) {
        this.verificationService = verificationService;
    }

    @ApplicationModuleListener
    public void onTenancyCancelled(TenancyCancelledEvent event) {
        verificationService.cancelForTenancy(event.tenancyId());
    }
}
