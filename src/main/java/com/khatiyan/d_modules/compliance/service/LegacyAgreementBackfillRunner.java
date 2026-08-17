package com.khatiyan.d_modules.compliance.service;

import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.TenancyAgreement;
import com.khatiyan.d_modules.compliance.repository.TenancyAgreementRepository;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Gives every already-running monthly tenancy the agreement the model now
 * requires.
 *
 * <p>Monthly onboarding is agreement-only from now on, but tenancies created
 * before that rule have none — and end-tenancy reads its early-exit rule off the
 * agreement, so without one those stays cannot be closed properly.
 *
 * <p><b>One-time and self-disabling.</b> It backfills only tenancies that have
 * no agreement, so the second run finds nothing and does nothing. There is no
 * flag to set and nothing to remember to remove; once the gap is closed it is a
 * no-op forever.
 *
 * <p><b>Why the agreements are written ACCEPTED.</b> These tenants are already
 * living under these terms and their billing is already running. Creating a
 * PENDING agreement instead would ask them to accept, and acceptance calls
 * {@code initializeStartedTenancy}, which opens cycle 1 — colliding with the
 * cycles they already have. The agreement is therefore recorded as a retro-fit
 * of terms already in force, dated to the tenancy's own start, <em>not</em> as a
 * fresh consent event. It is a record, not a signature.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LegacyAgreementBackfillRunner {

    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private final TenancyModule tenancyModule;
    private final TenancyAgreementRepository agreementRepository;
    private final TenancyAgreementService agreementService;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfill() {
        List<TenancyResponse> candidates = tenancyModule.findActiveBillingStartedMonthlyTenancies().stream()
                .filter(tenancy -> agreementRepository.findByTenancyId(tenancy.id()).isEmpty())
                .toList();

        if (candidates.isEmpty()) {
            log.debug("Legacy agreement backfill found nothing to do");
            return;
        }

        int created = 0;
        for (TenancyResponse tenancy : candidates) {
            try {
                List<AgreementClause> clauses = agreementService.assembleForExistingTenancy(tenancy);
                TenancyAgreement agreement = TenancyAgreement.pending(
                        tenancy.id(), tenancy.propertyId(), clauses);
                agreement.accept(
                        tenancy.userId(),
                        agreementService.contentHashOf(clauses),
                        tenancy.startDate().atTime(LocalTime.NOON).atZone(ZONE).toInstant());
                agreementRepository.save(agreement);
                created = created + 1;
            } catch (RuntimeException exception) {
                // One property missing its billing or exit policy must not stop
                // the rest: the next boot retries only what is still missing.
                log.error("Legacy agreement backfill failed tenancyId={}", tenancy.id(), exception);
            }
        }

        log.info("Legacy agreement backfill complete candidates={} created={}", candidates.size(), created);
    }
}
