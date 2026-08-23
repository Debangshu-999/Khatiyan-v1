package com.khatiyan.d_modules.compliance.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.annotation.JsonInclude;
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
    private final ComplianceAccessPolicy complianceAccessPolicy;
    /**
     * Dedicated mapper for {@link #contentHash}, pinned to NON_NULL inclusion.
     *
     * <p>
     * The hash pins an accepted legal agreement, so its bytes must never move.
     * Sharing the application mapper made it depend on
     * {@code spring.jackson.default-property-inclusion} — flipping that setting
     * would silently invalidate every hash already stored against a signed
     * agreement. Pinning it here makes the hash independent of app config.
     */
    private final ObjectMapper hashMapper;

    public TenancyAgreementService(
            TenancyAgreementRepository agreementRepository,
            AgreementService agreementService,
            AgreementAssembler assembler,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ComplianceAccessPolicy complianceAccessPolicy,
            ObjectMapper objectMapper) {
        this.agreementRepository = agreementRepository;
        this.agreementService = agreementService;
        this.assembler = assembler;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.complianceAccessPolicy = complianceAccessPolicy;
        this.hashMapper = objectMapper.copy().setSerializationInclusion(JsonInclude.Include.NON_NULL);
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

    /**
     * Assembles the clause set for a tenancy that already exists.
     *
     * <p>Used by the one-time backfill that gives pre-agreement monthly stays the
     * agreement the model now requires. Reads the tenancy's own rent and deposit
     * so the document states what the tenant is actually paying, not the
     * property's current defaults.
     */
    @Transactional(readOnly = true)
    public List<AgreementClause> assembleForExistingTenancy(TenancyResponse tenancy) {
        // The tenancy's creator is used as the actor: settings seeding is an
        // owner-scoped read, and there is no human present during a backfill.
        PropertyAgreementSettings settings =
                agreementService.getOrSeedPropertySettings(tenancy.createdByUserId(), tenancy.propertyId());
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());
        PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(tenancy.propertyId());
        PropertyExitPolicyResponse exitPolicy = propertyModule.getExitPolicy(tenancy.propertyId());

        return assembler.assemble(
                property,
                billingPolicy,
                exitPolicy,
                tenancy.rentAmountPaise() != null ? tenancy.rentAmountPaise() : 0,
                tenancy.depositAmountPaise() != null ? tenancy.depositAmountPaise() : 0,
                settings.getDefaultClauses(),
                null);
    }

    /** The content hash for a clause set, using the same pinned mapper as acceptance. */
    public String contentHashOf(List<AgreementClause> clauses) {
        return contentHash(clauses);
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

        // Authoring clause prose is a TENANCY_RULES power, but creating the
        // tenancy is TENANCY_CREATE — a manager can hold one without the other.
        // Passing null makes the assembler fall back to the property's stored
        // defaults, so someone who may create but not write rules gets the
        // agreement the owner intended rather than a rejected request.
        List<AgreementClause> customClauses = complianceAccessPolicy.canManageRules(actorUserId, request.propertyId())
                ? toCustomClauses(request.customClauses())
                : null;

        // Per-tenancy system-rule overrides are applied to a COPY of the
        // property's defaults. The stored settings are never touched, so a term
        // agreed with one tenant cannot leak into anyone else's agreement or
        // into the property template the next onboarding starts from.
        List<AgreementClause> tenancyDefaults = withTenancyOverrides(
                settings.getDefaultClauses(), request.term(), request.permittedDeductions());

        List<AgreementClause> clauses = assembler.assemble(
                property,
                billingPolicy,
                exitPolicy,
                tenancy.rentAmountPaise() != null ? tenancy.rentAmountPaise() : 0,
                tenancy.depositAmountPaise() != null ? tenancy.depositAmountPaise() : 0,
                tenancyDefaults,
                customClauses);

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
        complianceAccessPolicy.ensureCanViewTenancyAgreement(actorUserId, tenancy.propertyId());
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
        complianceAccessPolicy.ensureCanAmendTenancyAgreement(actorUserId, tenancy.propertyId());

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
        stampAgreementTerms(tenancy, agreement);

        log.info(
                "Tenancy agreement accepted agreementId={} tenancyId={} tenantUserId={} contentHash={}",
                agreement.getId(),
                tenancy.id(),
                tenantUserId,
                agreement.getContentHash());

        return agreement;
    }

    /**
     * The property's default clauses with this tenancy's overrides folded in.
     *
     * <p>Returns a new list; the stored settings are left alone. Only VALIDITY
     * and ALLOWED_DEDUCTIONS may be varied — everything else stays uniform
     * across the property, which is the whole reason system rules are derived
     * rather than copied.
     */
    private List<AgreementClause> withTenancyOverrides(
            List<AgreementClause> propertyDefaults,
            OnboardTenancyWithAgreementRequest.AgreementTermInput term,
            List<String> permittedDeductions) {

        if (term == null && permittedDeductions == null) {
            return propertyDefaults;
        }

        List<AgreementClause> result = new ArrayList<>();
        for (AgreementClause clause : propertyDefaults != null ? propertyDefaults : List.<AgreementClause>of()) {
            boolean isValidity = clause.getKind() == ClauseKind.SYSTEM
                    && (clause.getSystemType() == SystemClauseType.VALIDITY
                            || clause.getSystemType() == SystemClauseType.LOCK_IN);
            boolean isDeductions = clause.getKind() == ClauseKind.SYSTEM
                    && clause.getSystemType() == SystemClauseType.ALLOWED_DEDUCTIONS;

            if (isValidity && term != null) {
                result.add(validityClause(clause, term.months()));
            } else if (isDeductions && permittedDeductions != null) {
                result.add(deductionsClause(clause, permittedDeductions));
            } else {
                result.add(clause);
            }
        }
        return result;
    }

    /** Rebuilds the validity clause, prose included, so value and text agree. */
    private static AgreementClause validityClause(AgreementClause original, Integer months) {
        Map<String, Object> value = original.getValue() != null ? new LinkedHashMap<>(original.getValue()) : new LinkedHashMap<>();
        String rule = value.get("earlyExitRule") != null ? value.get("earlyExitRule").toString().trim() : "";
        value.put("validityMonths", months);
        value.remove("months");

        String body = months != null
                ? "This agreement runs for " + months + " month" + (months == 1 ? "" : "s")
                        + " from the start of the tenancy, and the tenancy ends with it."
                        + (rule.isEmpty() ? "" : " If the tenancy ends earlier: " + rule)
                : "This agreement runs until the tenancy ends. Either party may end it with the required notice.";

        return AgreementClause.system(
                SystemClauseType.VALIDITY, original.getHeading(), body, value, original.getDisplayOrder());
    }

    /**
     * Narrows the permitted deductions to the chosen subset.
     *
     * <p>Anything not already permitted by the property is dropped rather than
     * rejected: the list is a narrowing, and silently widening it would grant
     * the deposit powers the property's own agreement never claimed.
     */
    private static AgreementClause deductionsClause(AgreementClause original, List<String> chosen) {
        Map<String, Object> value = original.getValue() != null ? new LinkedHashMap<>(original.getValue()) : new LinkedHashMap<>();
        Object existing = value.get("categories");
        List<String> allowed = existing instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
        List<String> narrowed = chosen.stream().filter(allowed::contains).toList();

        value.put("categories", narrowed);
        String body = narrowed.isEmpty()
                ? "The deposit may not be used for deductions; it is returned in full less any agreed charges."
                : "At move-out the deposit may be used only for "
                        + String.join(", ", narrowed.stream().map(TenancyAgreementService::humanize).toList())
                        + ".";

        return AgreementClause.system(
                SystemClauseType.ALLOWED_DEDUCTIONS, original.getHeading(), body, value, original.getDisplayOrder());
    }

    private static String humanize(String token) {
        return token.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    // Reads the agreement's validity and early-exit rule off the frozen clause and
    // stamps them onto the tenancy, so tenancy can answer "is this a fixed term,
    // and when does it end" without reaching into compliance.
    //
    // Null months means indefinite — the agreement, and the tenancy, end only
    // when the tenant exits. A value gives a fixed term whose end date the
    // tenancy derives once and carries from day one.
    private void stampAgreementTerms(TenancyResponse tenancy, TenancyAgreement agreement) {
        AgreementClause validity = agreement.getClauses().stream()
                // LOCK_IN too: agreements signed before the rename are frozen and
                // keep the old name forever.
                .filter(clause -> clause.getKind() == ClauseKind.SYSTEM
                        && (clause.getSystemType() == SystemClauseType.VALIDITY
                                || clause.getSystemType() == SystemClauseType.LOCK_IN))
                .findFirst()
                .orElse(null);

        Integer validityMonths = null;
        String earlyExitRule = null;
        if (validity != null && validity.getValue() != null) {
            Map<String, Object> value = validity.getValue();
            // Legacy clauses carry "months"; current ones carry "validityMonths".
            int months = value.containsKey("validityMonths")
                    ? intValue(value.get("validityMonths"))
                    : intValue(value.get("months"));
            // Null or zero both mean indefinite. Zero was the old lock-in's way
            // of saying "agreement-backed with no minimum stay"; that state no
            // longer exists, and JSONB gives null for a key nobody wrote.
            validityMonths = months > 0 ? months : null;
            Object rule = value.get("earlyExitRule");
            String ruleText = rule != null ? rule.toString().trim() : "";
            earlyExitRule = ruleText.isEmpty() ? null : ruleText;
        }

        tenancyModule.stampAgreementTerms(tenancy.id(), validityMonths, earlyExitRule);
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

    /**
     * Owner or manager withdraws an unaccepted tenancy.
     *
     * <p>Goes through compliance rather than straight to tenancy so the
     * agreement is cancelled in the SAME transaction, exactly as the tenant's
     * decline and the expiry job do. Cancelling only the tenancy would leave the
     * agreement PENDING_ACCEPTANCE forever, and the nightly expiry job would
     * then try to cancel an already-cancelled tenancy every night from here on.
     */
    @Transactional
    public void cancelPendingAsManager(UUID actorUserId, UUID tenancyId, String reason) {
        TenancyAgreement agreement = getAgreementByTenancyId(tenancyId);
        ensurePending(agreement);

        agreement.cancel();
        tenancyModule.cancelPendingTenancyByManager(actorUserId, tenancyId, reason);

        log.info(
                "Pending tenancy withdrawn by manager agreementId={} tenancyId={} actorUserId={}",
                agreement.getId(),
                tenancyId,
                actorUserId);
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
            byte[] json = hashMapper.writeValueAsBytes(clauses);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(json));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Could not hash agreement content", exception);
        }
    }
}
