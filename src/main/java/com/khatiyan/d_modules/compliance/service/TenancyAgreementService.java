package com.khatiyan.d_modules.compliance.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.compliance.api.dto.CustomClauseInput;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementStatus;
import com.khatiyan.d_modules.compliance.model.ClauseKind;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;
import com.khatiyan.d_modules.compliance.model.SystemClauseType;
import com.khatiyan.d_modules.compliance.model.TenancyAgreement;
import com.khatiyan.d_modules.compliance.repository.TenancyAgreementRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Per-tenancy agreement lifecycle: assemble at onboarding, edit custom clauses
 * while pending, freeze into the immutable snapshot on acceptance (activating
 * the tenancy in the same transaction), cancel on decline or expiry.
 */
@Slf4j
@Service
public class TenancyAgreementService {

    private final TenancyAgreementRepository agreementRepository;
    private final AgreementService agreementService;
    private final AgreementAssembler assembler;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final ObjectMapper objectMapper;

    public TenancyAgreementService(
            TenancyAgreementRepository agreementRepository,
            AgreementService agreementService,
            AgreementAssembler assembler,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ObjectMapper objectMapper) {
        this.agreementRepository = agreementRepository;
        this.agreementService = agreementService;
        this.assembler = assembler;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.objectMapper = objectMapper;
    }

    /**
     * Assembles the clause list the agreement WOULD contain, for the onboarding
     * review screen. Rent/deposit come from the form (already defaulted from
     * room/property there); a missing deposit falls back to the property value.
     */
    @Transactional(readOnly = true)
    public List<AgreementClause> preview(
            UUID actorUserId, UUID propertyId, Long rentAmountPaise, Long depositAmountPaise) {
        PropertyAgreementSettings settings = agreementService.getOrSeedPropertySettings(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(propertyId);
        PropertyExitPolicyResponse exitPolicy = propertyModule.getExitPolicy(propertyId);

        long rent = rentAmountPaise != null && rentAmountPaise > 0 ? rentAmountPaise : 0;
        long deposit = depositAmountPaise != null && depositAmountPaise >= 0
                ? depositAmountPaise
                : property.standardDepositPaise();

        return assembler.assemble(property, billingPolicy, exitPolicy, rent, deposit, settings.getDefaultClauses(), null);
    }

    /** Result of agreement-path onboarding: the pending tenancy + its agreement. */
    public record OnboardResult(boolean tenantAccountCreated, TenancyResponse tenancy, TenancyAgreement agreement) {
    }

    /**
     * Agreement-path onboarding: creates the pending tenancy through the tenancy
     * facade and its agreement in one transaction. The agreement's rent/deposit
     * are taken from the created tenancy (single source of truth).
     */
    @Transactional
    public OnboardResult onboardWithAgreement(UUID actorUserId, OnboardTenancyWithAgreementRequest request) {
        PropertyAgreementSettings settings = agreementService.getOrSeedPropertySettings(actorUserId, request.propertyId());
        PropertyResponse property = propertyModule.getActiveProperty(request.propertyId());
        PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(request.propertyId());
        PropertyExitPolicyResponse exitPolicy = propertyModule.getExitPolicy(request.propertyId());

        TenancyOnboardingResponse onboarding = tenancyModule.onboardPendingMonthly(
                actorUserId,
                request.tenantPhone(),
                request.tenantName(),
                request.propertyId(),
                request.roomId(),
                request.rentAmountPaise(),
                request.depositAmountPaise(),
                request.startDate(),
                request.idCheckConfirmed());
        TenancyResponse tenancy = onboarding.tenancy();

        List<AgreementClause> clauses = assembler.assemble(
                property,
                billingPolicy,
                exitPolicy,
                tenancy.rentAmountPaise() != null ? tenancy.rentAmountPaise() : 0,
                tenancy.depositAmountPaise() != null ? tenancy.depositAmountPaise() : 0,
                settings.getDefaultClauses(),
                toCustomClauses(request.customClauses()));

        TenancyAgreement agreement = agreementRepository.save(
                TenancyAgreement.pending(tenancy.id(), request.propertyId(), clauses));

        log.info(
                "Tenancy agreement created agreementId={} tenancyId={} propertyId={} actorUserId={} clauses={}",
                agreement.getId(),
                tenancy.id(),
                request.propertyId(),
                actorUserId,
                clauses.size());

        return new OnboardResult(onboarding.tenantAccountCreated(), tenancy, agreement);
    }

    /** Owner/manager view of a tenancy's agreement. */
    @Transactional(readOnly = true)
    public TenancyAgreement getForManagedTenancy(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());
        return getAgreementByTenancyId(tenancyId);
    }

    /** Tenant view of their own (pending or accepted) agreement. */
    @Transactional(readOnly = true)
    public TenancyAgreement getMyAgreement(UUID tenantUserId) {
        TenancyResponse tenancy = getMyTenancy(tenantUserId);
        return getAgreementByTenancyId(tenancy.id());
    }

    /**
     * Owner edit while pending: replaces only the CUSTOM prose clauses. System
     * clauses are derived and locked.
     */
    @Transactional
    public TenancyAgreement updateCustomClauses(UUID actorUserId, UUID tenancyId, List<CustomClauseInput> customClauses) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());

        TenancyAgreement agreement = getAgreementByTenancyId(tenancyId);
        ensurePending(agreement);

        List<AgreementClause> rebuilt = new ArrayList<>();
        int order = 0;
        for (AgreementClause clause : agreement.getClauses()) {
            if (clause.getKind() == ClauseKind.SYSTEM) {
                clause.setDisplayOrder(order++);
                rebuilt.add(clause);
            }
        }
        for (CustomClauseInput custom : customClauses) {
            rebuilt.add(AgreementClause.custom(custom.heading().trim(), custom.body().trim(), order++));
        }
        agreement.replaceClauses(rebuilt);

        log.info(
                "Tenancy agreement custom clauses updated agreementId={} tenancyId={} actorUserId={} customs={}",
                agreement.getId(),
                tenancyId,
                actorUserId,
                customClauses.size());

        return agreement;
    }

    /**
     * Tenant clickwrap acceptance: freezes the agreement (content hash + who +
     * when) and activates the tenancy — one transaction, so there is never an
     * active tenancy without its legal snapshot.
     */
    @Transactional
    public TenancyAgreement accept(UUID tenantUserId) {
        TenancyResponse tenancy = getMyTenancy(tenantUserId);
        TenancyAgreement agreement = getAgreementByTenancyId(tenancy.id());
        ensurePending(agreement);

        agreement.accept(tenantUserId, contentHash(agreement.getClauses()), Instant.now());
        tenancyModule.acceptTermsAndActivate(tenancy.id(), tenantUserId);
        stampLockInTerms(tenancy, agreement);

        log.info(
                "Tenancy agreement accepted agreementId={} tenancyId={} tenantUserId={} contentHash={}",
                agreement.getId(),
                tenancy.id(),
                tenantUserId,
                agreement.getContentHash());

        return agreement;
    }

    // Resolves the lock-in rule from the frozen agreement and stamps the derived
    // exit terms onto the tenancy, so the tenancy module can compute early-exit
    // penalties itself. lockInEndDate is a minimum-stay marker (start + months);
    // it is stamped even when months is 0, which marks the tenancy agreement-backed
    // (premature-only exit) with a zero penalty.
    private void stampLockInTerms(TenancyResponse tenancy, TenancyAgreement agreement) {
        AgreementClause lockIn = agreement.getClauses().stream()
                .filter(clause -> clause.getKind() == ClauseKind.SYSTEM
                        && clause.getSystemType() == SystemClauseType.LOCK_IN)
                .findFirst()
                .orElse(null);

        int months = 0;
        String penaltyType = "REMAINING_TERM";
        long penaltyFixedPaise = 0L;
        if (lockIn != null && lockIn.getValue() != null) {
            Map<String, Object> value = lockIn.getValue();
            months = intValue(value.get("months"));
            Object type = value.get("penaltyType");
            penaltyType = type != null ? type.toString() : "REMAINING_TERM";
            penaltyFixedPaise = longValue(value.get("penaltyFixedPaise"));
        }

        LocalDate startDate = tenancy.startDate();
        LocalDate lockInEndDate = startDate != null ? startDate.plusMonths(months) : null;
        tenancyModule.stampAgreementExitTerms(tenancy.id(), lockInEndDate, penaltyType, penaltyFixedPaise);
    }

    private static int intValue(Object raw) {
        return raw instanceof Number number ? number.intValue() : 0;
    }

    private static long longValue(Object raw) {
        return raw instanceof Number number ? number.longValue() : 0L;
    }

    /** Tenant decline: cancels the agreement and the pending tenancy immediately. */
    @Transactional
    public void decline(UUID tenantUserId) {
        TenancyResponse tenancy = getMyTenancy(tenantUserId);
        TenancyAgreement agreement = getAgreementByTenancyId(tenancy.id());
        ensurePending(agreement);

        agreement.cancel();
        tenancyModule.declinePendingTenancy(tenancy.id(), tenantUserId, "Tenant declined the agreement");

        log.info(
                "Tenancy agreement declined agreementId={} tenancyId={} tenantUserId={}",
                agreement.getId(),
                tenancy.id(),
                tenantUserId);
    }

    /** Tenancy ids of agreements still pending past the acceptance window. */
    @Transactional(readOnly = true)
    public List<UUID> findExpiredPendingTenancyIds(int ttlDays) {
        Instant cutoff = Instant.now().minus(ttlDays, ChronoUnit.DAYS);
        return agreementRepository.findByStatusAndCreatedAtBefore(AgreementStatus.PENDING_ACCEPTANCE, cutoff)
                .stream()
                .map(TenancyAgreement::getTenancyId)
                .toList();
    }

    /** Expires one overdue pending agreement + its tenancy (scheduler unit). */
    @Transactional
    public void expirePendingAgreement(UUID tenancyId) {
        TenancyAgreement agreement = getAgreementByTenancyId(tenancyId);
        if (agreement.getStatus() != AgreementStatus.PENDING_ACCEPTANCE) {
            return;
        }
        agreement.cancel();
        tenancyModule.cancelPendingTenancyBySystem(tenancyId, "Agreement acceptance window expired");

        log.info(
                "Tenancy agreement expired agreementId={} tenancyId={}",
                agreement.getId(),
                tenancyId);
    }

    private List<AgreementClause> toCustomClauses(List<CustomClauseInput> inputs) {
        if (inputs == null) {
            return null;
        }
        List<AgreementClause> clauses = new ArrayList<>();
        int order = 0;
        for (CustomClauseInput input : inputs) {
            clauses.add(AgreementClause.custom(input.heading().trim(), input.body().trim(), order++));
        }
        return clauses;
    }

    // The tenant's newest is_active tenancy — a pending one is included, which
    // is exactly what the accept/decline flow needs.
    private TenancyResponse getMyTenancy(UUID tenantUserId) {
        return tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenantUserId));
    }

    private TenancyResponse getTenancy(UUID tenancyId) {
        return tenancyModule.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
    }

    private TenancyAgreement getAgreementByTenancyId(UUID tenancyId) {
        return agreementRepository.findByTenancyId(tenancyId)
                .orElseThrow(() -> new NotFoundException("TenancyAgreement", tenancyId));
    }

    private void ensurePending(TenancyAgreement agreement) {
        if (agreement.getStatus() != AgreementStatus.PENDING_ACCEPTANCE) {
            throw new ValidationException("Agreement is not pending acceptance");
        }
    }

    // SHA-256 over the serialized clause list. The hash pins the exact accepted
    // content; the frozen row itself remains the readable record.
    private String contentHash(List<AgreementClause> clauses) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(clauses);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(json));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Could not hash agreement content", exception);
        }
    }
}
