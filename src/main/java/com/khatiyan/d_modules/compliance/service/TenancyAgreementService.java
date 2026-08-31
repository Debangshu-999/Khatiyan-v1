package com.khatiyan.d_modules.compliance.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.compliance.api.dto.AcceptAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.AgreementSigningChallengeResponse;
import com.khatiyan.d_modules.compliance.api.dto.DeviceFingerprintInput;
import com.khatiyan.d_modules.compliance.model.Attestation;
import com.khatiyan.d_modules.compliance.model.AttestationKind;
import com.khatiyan.d_modules.compliance.model.DeviceFingerprint;
import com.khatiyan.d_modules.compliance.model.LegalStatement;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.compliance.api.dto.AgreementDeedResponse;
import com.khatiyan.d_modules.compliance.api.dto.AgreementPreviewQuery;
import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementRequest;
import com.khatiyan.d_modules.compliance.api.dto.OnboardingReadinessResponse;
import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementPreamble;
import com.khatiyan.d_modules.compliance.model.AgreementStatus;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.PropertyAgreementSettings;
import com.khatiyan.d_modules.compliance.model.TenancyAgreement;
import com.khatiyan.d_modules.compliance.repository.TenancyAgreementRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyBillingPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyExitPolicyResponse;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.DeductionCategory;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyOnboardingResponse;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyBillingType;

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
    private final PreambleTemplate preambleTemplate;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final ComplianceAccessPolicy complianceAccessPolicy;
    private final AttestationService attestationService;
    private final AuthModule authModule;
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

    /**
     * "Today" for a preview with no start date yet.
     *
     * <p>Pinned to IST rather than the host zone: the deed is an Indian document
     * and every date on it is an Indian date. A server in UTC would show a preview
     * dated yesterday for anything after 6:30pm local.
     */
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public TenancyAgreementService(
            TenancyAgreementRepository agreementRepository,
            AgreementService agreementService,
            AgreementAssembler assembler,
            PreambleTemplate preambleTemplate,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            ComplianceAccessPolicy complianceAccessPolicy,
            AttestationService attestationService,
            AuthModule authModule,
            ObjectMapper objectMapper) {
        this.agreementRepository = agreementRepository;
        this.agreementService = agreementService;
        this.assembler = assembler;
        this.preambleTemplate = preambleTemplate;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.complianceAccessPolicy = complianceAccessPolicy;
        this.attestationService = attestationService;
        this.authModule = authModule;
        this.hashMapper = objectMapper.copy().setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    /**
     * The deed as it WOULD read, for the onboarding review screen.
     *
     * <p>Takes the room and the term as well as the money, because the deed says
     * more than a number: the period clause states the term's dates and the
     * furniture clause lists the room's fittings. A preview built without them
     * would show two clauses that differ from the ones actually created, which is
     * worse than showing no preview at all.
     *
     * <p>Clause selection falls back to the property's stored template when the
     * caller supplies none — the onboarding screen sends its own once the owner
     * starts dropping clauses for this one stay.
     */
    @Transactional(readOnly = true)
    public AgreementDeedResponse preview(UUID actorUserId, AgreementPreviewQuery query) {
        PropertyAgreementSettings settings =
                agreementService.getOrSeedPropertySettings(actorUserId, query.propertyId());
        PropertyResponse property = propertyModule.getActiveProperty(query.propertyId());

        long rent = query.rentAmountPaise() != null && query.rentAmountPaise() > 0 ? query.rentAmountPaise() : 0;
        long deposit = query.depositAmountPaise() != null && query.depositAmountPaise() >= 0
                ? query.depositAmountPaise()
                : property.standardDepositPaise();

        AgreementTemplate template = query.template() != null ? query.template() : settings.getTemplate();
        LocalDate startDate = query.startDate() != null ? query.startDate() : LocalDate.now(IST);

        // A template preview takes its term from the TEMPLATE. The tenancy path
        // takes it from the query, because onboarding may vary it for one stay —
        // and reading the query on the template path is what made every previewed
        // agreement render as indefinite regardless of the owner's setting.
        DeedFacts facts = query.templateOnly()
                ? facts(
                        property,
                        null,
                        0L,
                        0L,
                        startDate,
                        template.defaultValidityMonths(),
                        template.defaultEarlyExitRule(),
                        false,
                        true)
                : facts(
                        property,
                        query.roomId(),
                        rent,
                        deposit,
                        startDate,
                        query.validityMonths(),
                        query.earlyExitRule(),
                        false,
                        false);

        // The tenant has no ACCOUNT yet at preview time, but the onboarding form
        // has already collected who they are — so the deed names them. Only the
        // settings screen, which has no tenant at all, still shows the block as
        // what will be asked for.
        return new AgreementDeedResponse(
                preambleTemplate.render(
                        landlordOf(property, startDate),
                        query.templateOnly() ? PartyDetails.unknown() : tenantPreviewOf(query.tenant(), startDate),
                        premisesOf(property, query.templateOnly() ? null : query.roomId()),
                        facts,
                        null),
                assembler.assemble(template, facts));
    }

    /**
     * The deed as the PROPERTY would issue it, for the agreement settings screen.
     *
     * <p>Every value onboarding supplies — the rent, the deposit, the dates, the
     * room's furnishings — renders as its own name, underlined, the way a printed
     * form shows what goes on each line. The owner's own policy still resolves:
     * the notice period, grace days, permitted deductions and checklist are things
     * they have already set, and hiding those behind placeholders would conceal
     * exactly what the screen exists to configure.
     */
    @Transactional(readOnly = true)
    public AgreementDeedResponse previewTemplate(PropertyAgreementSettings settings) {
        PropertyResponse property = propertyModule.getActiveProperty(settings.getPropertyId());
        AgreementTemplate template = settings.getTemplate();
        LocalDate today = LocalDate.now(IST);

        DeedFacts facts = facts(
                property,
                null,
                0L,
                0L,
                today,
                template.defaultValidityMonths(),
                template.defaultEarlyExitRule(),
                false,
                true);

        // The Landlord resolves — it is the owner, and they are sitting on this
        // screen. Everything the tenant supplies is a placeholder.
        return new AgreementDeedResponse(
                preambleTemplate.render(
                        landlordOf(property, today),
                        PartyDetails.unknown(),
                        premisesOf(property, null),
                        facts,
                        null),
                assembler.assemble(template, facts));
    }

    /**
     * Everything the clause templates need, gathered from the three owners of it.
     *
     * <p>The term is passed in rather than read back off the tenancy so this works
     * for a preview, where no tenancy exists yet. At onboarding the same values
     * are stamped onto the tenancy first, so the deed and the tenancy state the
     * same term rather than two that can drift.
     */
    private DeedFacts facts(
            PropertyResponse property,
            UUID roomId,
            long rentAmountPaise,
            long depositAmountPaise,
            LocalDate startDate,
            Integer validityMonths,
            String earlyExitRule,
            boolean dailyBilling,
            boolean unresolved) {

        PropertyBillingPolicyResponse billingPolicy = propertyModule.getBillingPolicy(property.id());
        PropertyExitPolicyResponse exitPolicy = propertyModule.getExitPolicy(property.id());

        boolean fixedTerm = validityMonths != null && validityMonths > 0;
        // Derived EXACTLY as Tenancy.stampAgreementTerms derives it: plusMonths,
        // with no day subtracted. An earlier version took a day off, which would
        // have made every preview state an end date one day before the deed
        // actually created — the one thing a preview must never do.
        LocalDate endDate = fixedTerm ? startDate.plusMonths(validityMonths) : null;

        return new DeedFacts(
                startDate,
                fixedTerm ? validityMonths : null,
                endDate,
                rentAmountPaise,
                depositAmountPaise,
                dailyBilling,
                earlyExitRule,
                property.foodIncluded(),
                property.electricityIncluded(),
                billingPolicy.rentGraceDays(),
                billingPolicy.rentLateFeePerDayPaise() != null ? billingPolicy.rentLateFeePerDayPaise() : 0L,
                property.noticePeriod().label(),
                property.prematureExitPolicy(),
                deductionLabels(exitPolicy),
                exitPolicy.exitChecklist() != null ? exitPolicy.exitChecklist() : List.of(),
                furnishings(property.id(), roomId),
                unresolved);
    }

    private static List<String> deductionLabels(PropertyExitPolicyResponse exitPolicy) {
        if (exitPolicy.permittedDeductions() == null) {
            return List.of();
        }
        return exitPolicy.permittedDeductions().stream().map(DeductionCategory::label).toList();
    }

    /**
     * What the room comes with, for the furniture schedule.
     *
     * <p>Read from the room rather than its type, because a room can be cut from a
     * type and then given extras of its own — and the schedule has to describe the
     * room this tenant is actually moving into.
     */
    private List<String> furnishings(UUID propertyId, UUID roomId) {
        if (roomId == null) {
            return List.of();
        }
        return propertyModule.findRoomForDisplay(propertyId, roomId)
                .map(room -> {
                    List<String> labels = new ArrayList<>();
                    room.amenities().forEach(amenity -> labels.add(humanize(amenity.name())));
                    labels.addAll(room.customAmenities());
                    return labels;
                })
                .orElseGet(List::of);
    }

    /**
     * Whether onboarding can start here — for the screen, before any form.
     *
     * <p>Deliberately a read rather than a trial run of the write: the owner
     * should see the block on arrival, not after filling in a tenant's details.
     * {@link #ensureLandlordCanBeNamed} still runs on the write.
     */
    @Transactional(readOnly = true)
    public OnboardingReadinessResponse onboardingReadiness(UUID actorUserId, UUID propertyId) {
        complianceAccessPolicy.ensureCanViewRules(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        return authModule.findIdentity(property.ownerId())
                .map(owner -> new OnboardingReadinessResponse(
                        owner.agreementReady(),
                        property.ownerId().equals(actorUserId),
                        owner.fullName()))
                .orElseGet(() -> new OnboardingReadinessResponse(
                        false, property.ownerId().equals(actorUserId), null));
    }

    /**
     * Refuses onboarding until the OWNER's profile can carry a deed.
     *
     * <p>Name, verified email, permanent address. The gate is on the property's
     * owner rather than on whoever is acting, because the owner is the party the
     * document names — a manager with an immaculate profile does not make the
     * Landlord's block printable.
     *
     * <p>Which means a manager can be blocked by something they cannot fix, so the
     * message has to say whose profile is at fault. Telling a manager to "complete
     * your profile" would send them to a screen where everything is already
     * filled in.
     *
     * <p>The screen shows this as a board before the flow starts; this is the rule
     * behind it. Age and gender are deliberately not required — the deed omits
     * them when absent.
     */
    private void ensureLandlordCanBeNamed(PropertyResponse property, UUID actorUserId) {
        boolean ready = authModule.findIdentity(property.ownerId())
                .map(owner -> owner.agreementReady())
                .orElse(false);
        if (ready) {
            return;
        }

        throw new ValidationException(property.ownerId().equals(actorUserId)
                ? "Complete your profile before onboarding a tenant. The agreement names you as the Landlord, so"
                        + " it needs your full name, a verified email address and your permanent address."
                : "The property owner's profile is incomplete, so an agreement cannot be prepared. They need a full"
                        + " name, a verified email address and a permanent address on their account.");
    }

    /**
     * The Landlord: always the property's OWNER.
     *
     * <p>Never the manager who ran the onboarding. A manager acts for the owner
     * but is not a party to the agreement, and naming them as one would put
     * somebody with no title to the premises in the position of granting the
     * licence.
     */
    private PartyDetails landlordOf(PropertyResponse property, LocalDate on) {
        return authModule.findIdentity(property.ownerId())
                .map(owner -> new PartyDetails(
                        owner.fullName(),
                        owner.ageOn(on),
                        label(owner.gender()),
                        owner.phone(),
                        owner.email(),
                        owner.permanentAddress(),
                        owner.permanentAddressPincode(),
                        true))
                .orElseGet(PartyDetails::unknown);
    }

    /**
     * The tenant as the onboarding form has them so far.
     *
     * <p>Marked {@code known} as soon as a name exists, because that is what
     * switches the block from named placeholders to real values. The individual
     * fields are allowed to be null underneath: the party renderer already omits
     * an absent age or gender on a known party, so a half-filled form previews
     * as a half-filled deed rather than refusing to resolve anything at all.
     */
    private PartyDetails tenantPreviewOf(AgreementPreviewQuery.TenantPreviewInput tenant, LocalDate on) {
        if (tenant == null || tenant.fullName() == null || tenant.fullName().isBlank()) {
            return PartyDetails.unknown();
        }

        return new PartyDetails(
                tenant.fullName().trim(),
                tenant.dateOfBirth() == null ? null : Period.between(tenant.dateOfBirth(), on).getYears(),
                label(tenant.gender()),
                tenant.phone(),
                // No email on a tenant's block — see docs/modules/compliance.md.
                null,
                tenant.permanentAddress(),
                tenant.permanentAddressPincode(),
                true);
    }

    private PartyDetails tenantOf(UUID tenantUserId, LocalDate on) {
        if (tenantUserId == null) {
            return PartyDetails.unknown();
        }
        return authModule.findIdentity(tenantUserId)
                .map(tenant -> new PartyDetails(
                        tenant.fullName(),
                        tenant.ageOn(on),
                        label(tenant.gender()),
                        tenant.phone(),
                        tenant.email(),
                        tenant.permanentAddress(),
                        tenant.permanentAddressPincode(),
                        true))
                .orElseGet(PartyDetails::unknown);
    }

    /**
     * The premises, down to the room.
     *
     * <p>A null room leaves the room number and type as placeholders, which is the
     * settings screen's case: the building is known, the bed is not.
     */
    private PremisesDetails premisesOf(PropertyResponse property, UUID roomId) {
        String roomNumber = null;
        String sharingLabel = null;
        if (roomId != null) {
            var room = propertyModule.findRoomForDisplay(property.id(), roomId).orElse(null);
            if (room != null) {
                roomNumber = room.roomNumber();
                sharingLabel = humanize(room.roomType().name()).toLowerCase(Locale.ROOT);
            }
        }
        return new PremisesDetails(
                property.name(),
                property.address(),
                property.area(),
                property.city(),
                property.state(),
                property.pincode(),
                roomNumber,
                sharingLabel);
    }

    private static String label(Gender gender) {
        return gender == null ? null : humanize(gender.name());
    }

    /** "ATTACHED_TOILET" reads as "Attached toilet" on a legal document. */
    private static String humanize(String token) {
        String spaced = token.toLowerCase(Locale.ROOT).replace('_', ' ');
        return spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
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
    public OnboardResult onboardWithAgreement(
            UUID actorUserId,
            OnboardTenancyWithAgreementRequest request,
            String clientIp,
            UUID sessionJti) {

        LegalStatement idStatement = LegalStatement.TENANT_ID_DECLARATION;
        if (!idStatement.text().equals(request.idCheckStatementText())) {
            throw new ValidationException(
                    "This version of the app is showing an outdated declaration. Update the app and try again.");
        }

        PropertyAgreementSettings settings = agreementService.getOrSeedPropertySettings(actorUserId, request.propertyId());
        PropertyResponse property = propertyModule.getActiveProperty(request.propertyId());

        ensureLandlordCanBeNamed(property, actorUserId);

        TenancyOnboardingResponse onboarding = tenancyModule.onboardPendingMonthly(
                actorUserId,
                request.tenantPhone(),
                request.tenantName(),
                request.propertyId(),
                request.roomId(),
                request.rentAmountPaise(),
                request.depositAmountPaise(),
                request.startDate(),
                request.idCheck());
        TenancyResponse tenancy = onboarding.tenancy();

        // Recorded here rather than inside the tenancy module, which would have
        // needed a dependency back on compliance and closed a cycle. Onboarding
        // is already orchestrated from this side, so the declaration and the
        // tenancy it is about are written in one transaction either way.
        attestationService.record(Attestation.builder()
                .kind(AttestationKind.TENANT_ID_DECLARATION)
                .subjectId(tenancy.id())
                .actorUserId(actorUserId)
                .sessionJti(sessionJti)
                .occurredAt(Instant.now())
                .clientIp(clientIp)
                .device(toFingerprint(request.device()))
                .statement(idStatement)
                // The particulars go in the hashed body, not just on the tenancy
                // row: the tenancy is editable and this is not, so a later change
                // to one leaves the other standing as it was.
                .details(Map.of(
                        "idDocumentType", request.idCheck().documentType().name(),
                        "idLastFour", request.idCheck().lastFour(),
                        "tenantPhone", request.tenantPhone()))
                .build());

        // Choosing clauses is a TENANCY_RULES power, but creating the tenancy is
        // TENANCY_CREATE — a manager can hold one without the other. Falling back
        // to the property's stored template means someone who may create but not
        // write rules gets the deed the owner intended, rather than a rejected
        // request for sending back the defaults they were shown.
        AgreementTemplate template = request.template() != null
                        && complianceAccessPolicy.canManageRules(actorUserId, request.propertyId())
                ? request.template()
                : settings.getTemplate();

        Integer validityMonths = request.term() != null ? request.term().months() : null;
        String earlyExitRule = request.term() != null ? request.term().earlyExitRule() : null;

        // Stamped BEFORE the deed is assembled, so the period clause prints the
        // same term the tenancy carries. This used to run the other way — the term
        // was read back off the frozen clause at acceptance — which made a legal
        // document the source of truth for a fact the tenancy had to enforce, and
        // meant deleting the clause's machine-readable value would have broken
        // fixed terms outright.
        tenancyModule.stampAgreementTerms(tenancy.id(), validityMonths, earlyExitRule);

        // Written BEFORE the preamble is built, so the deed names the tenant by
        // the details just collected rather than by an account that is still
        // half-empty. Blank fields only — a tenant who already had an address
        // keeps theirs.
        OnboardTenancyWithAgreementRequest.TenantDetailsInput details = request.tenant();
        authModule.fillMissingTenantIdentity(
                tenancy.userId(),
                details.permanentAddress(),
                details.permanentAddressPincode(),
                details.dateOfBirth(),
                details.gender());

        DeedFacts facts = facts(
                property,
                request.roomId(),
                tenancy.rentAmountPaise() != null ? tenancy.rentAmountPaise() : 0,
                tenancy.depositAmountPaise() != null ? tenancy.depositAmountPaise() : 0,
                request.startDate(),
                validityMonths,
                earlyExitRule,
                false,
                false);

        List<AgreementClause> clauses = assembler.assemble(template, facts);
        AgreementPreamble preamble = preambleTemplate.render(
                landlordOf(property, request.startDate()),
                tenantOf(tenancy.userId(), request.startDate()),
                premisesOf(property, request.roomId()),
                facts,
                null);

        TenancyAgreement agreement = agreementRepository.save(
                TenancyAgreement.pending(tenancy.id(), request.propertyId(), template, preamble, clauses));

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
     * Owner edit while pending: a new clause selection for this stay.
     *
     * <p>Replaces the template and re-runs the assembler rather than editing the
     * stored clauses, which is what lets a main clause be dropped or restored
     * here at all. The previous version could only append custom prose, because
     * it rebuilt the list by keeping every SYSTEM clause it found.
     *
     * <p>The re-assembly is a real re-derivation: a rent or notice period changed
     * on the property since onboarding is picked up. That is deliberate — the deed
     * has not been signed, so it should say what is currently true, and the
     * content hash moving is exactly what stops a tenant signing text they never
     * saw.
     */
    @Transactional
    public TenancyAgreement updateTemplate(UUID actorUserId, UUID tenancyId, AgreementTemplate template) {
        TenancyResponse tenancy = getTenancy(tenancyId);
        complianceAccessPolicy.ensureCanAmendTenancyAgreement(actorUserId, tenancy.propertyId());

        TenancyAgreement agreement = getAgreementByTenancyId(tenancyId);
        ensurePending(agreement);

        AgreementTemplate applied = template != null ? template : AgreementTemplate.starter();
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.propertyId());

        DeedFacts facts = facts(
                property,
                tenancy.roomId(),
                tenancy.rentAmountPaise() != null ? tenancy.rentAmountPaise() : 0,
                tenancy.depositAmountPaise() != null ? tenancy.depositAmountPaise() : 0,
                tenancy.startDate(),
                tenancy.agreementValidityMonths(),
                tenancy.earlyExitRule(),
                tenancy.billingType() == TenancyBillingType.DAILY,
                false);

        // The preamble is rebuilt too, not carried over. Either party may have
        // completed their profile since onboarding, and a deed that still named
        // them by a half-filled block would be amended in its clauses while
        // keeping stale parties.
        agreement.replace(
                applied,
                preambleTemplate.render(
                        landlordOf(property, tenancy.startDate()),
                        tenantOf(tenancy.userId(), tenancy.startDate()),
                        premisesOf(property, tenancy.roomId()),
                        facts,
                        null),
                assembler.assemble(applied, facts));

        log.info(
                "Tenancy agreement template updated agreementId={} tenancyId={} actorUserId={} clauses={} dropped={}",
                agreement.getId(),
                tenancyId,
                actorUserId,
                agreement.getClauses().size(),
                applied.excludedMainClauses().size());

        return agreement;
    }

    /**
     * Sends the signing code, and says what is being signed.
     *
     * <p>The content hash returned here is the whole reason this is two steps
     * rather than one. It pins the agreement as it stands at the moment the code
     * goes out; the client sends it back with the code, and {@link #accept}
     * refuses if the agreement has moved in between. Custom clauses stay
     * editable while an agreement is PENDING, so an owner amending them while
     * the tenant reads is not a hypothetical.
     */
    @Transactional
    public AgreementSigningChallengeResponse startSigning(UUID tenantUserId, String requestIpAddress) {
        TenancyResponse tenancy = getMyTenancy(tenantUserId);
        TenancyAgreement agreement = getAgreementByTenancyId(tenancy.id());
        ensurePending(agreement);

        String sentTo = authModule.startAgreementSigning(tenantUserId, requestIpAddress);
        LegalStatement statement = LegalStatement.TENANCY_AGREEMENT_ACCEPTANCE;

        return new AgreementSigningChallengeResponse(
                contentHash(agreement),
                sentTo,
                statement.text(),
                statement.key(),
                statement.version());
    }

    /**
     * Tenant clickwrap acceptance: freezes the agreement (content hash + who +
     * when) and activates the tenancy — one transaction, so there is never an
     * active tenancy without its legal snapshot.
     *
     * <p>Four things have to line up before anything is written, and each rules
     * out a different way the record could be wrong:
     *
     * <ul>
     *   <li>the agreement is still PENDING — nobody signs twice;
     *   <li>the wording the app displayed matches the wording we hold, so a
     *       stale or modified build cannot record agreement to words we did not
     *       write;
     *   <li>the agreement has not changed since the code was sent, so the
     *       signature cannot attach to text the signatory never saw;
     *   <li>the code checks out, and is spent doing so.
     * </ul>
     *
     * <p>The attestation is written in the same transaction as the acceptance.
     * A signature recorded without its evidence, or evidence without the
     * signature, would each be worse than neither.
     */
    @Transactional
    public TenancyAgreement accept(
            UUID tenantUserId,
            AcceptAgreementRequest request,
            String clientIp,
            UUID sessionJti) {

        TenancyResponse tenancy = getMyTenancy(tenantUserId);
        TenancyAgreement agreement = getAgreementByTenancyId(tenancy.id());
        ensurePending(agreement);

        LegalStatement statement = LegalStatement.TENANCY_AGREEMENT_ACCEPTANCE;
        if (!statement.text().equals(request.statementText())) {
            throw new ValidationException(
                    "This version of the app is showing outdated terms. Update the app and try again.");
        }

        String currentHash = contentHash(agreement);
        if (!currentHash.equals(request.contentHash())) {
            throw new ValidationException(
                    "This agreement changed while you were reading it. Review it again before accepting.");
        }

        // Last, and only once everything else holds: a code spent on a check
        // that was going to fail anyway would make the tenant ask for another.
        String sentTo = authModule.completeAgreementSigning(tenantUserId, request.otp());
        Instant now = Instant.now();

        agreement.accept(tenantUserId, currentHash, now);
        tenancyModule.acceptTermsAndActivate(tenancy.id(), tenantUserId);
        // The term is NOT read back off the deed here any more. It is stamped on
        // the tenancy at onboarding, before the deed is written, so the document
        // states the term the tenancy already carries rather than the tenancy
        // inheriting a term parsed back out of prose.

        attestationService.record(Attestation.builder()
                .kind(AttestationKind.TENANCY_AGREEMENT_ACCEPTANCE)
                .subjectId(tenancy.id())
                .actorUserId(tenantUserId)
                .sessionJti(sessionJti)
                .occurredAt(now)
                .clientIp(clientIp)
                .device(toFingerprint(request.device()))
                .statement(statement)
                .subjectHash(currentHash)
                .details(Map.of("agreementId", agreement.getId().toString()))
                .otpVerifiedAt(now)
                .otpChannel("SMS")
                .otpDestination(sentTo)
                .build());

        log.info(
                "Tenancy agreement accepted agreementId={} tenancyId={} tenantUserId={} contentHash={}",
                agreement.getId(),
                tenancy.id(),
                tenantUserId,
                agreement.getContentHash());

        return agreement;
    }

    /** Null-safe, because a device that reported nothing is still allowed to sign. */
    static DeviceFingerprint toFingerprint(DeviceFingerprintInput input) {
        if (input == null) {
            return null;
        }

        return new DeviceFingerprint(
                input.brand(),
                input.model(),
                input.osVersion(),
                input.osBuild(),
                input.appVersion(),
                input.installId(),
                input.platform());
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

    /**
     * SHA-256 over the preamble AND the clause list.
     *
     * <p>The preamble is included deliberately: a hash over the clauses alone pins
     * the terms but not the parties, so the two names on the deed could be changed
     * without disturbing the signature that is supposed to bind them.
     *
     * <p>The execution date inside the preamble is a placeholder and stays one —
     * see {@code TenancyAgreement}. Filling it at acceptance would move these
     * bytes at the exact instant of signing.
     */
    private String contentHash(TenancyAgreement agreement) {
        return contentHash(agreement.getPreamble(), agreement.getClauses());
    }

    private String contentHash(AgreementPreamble preamble, List<AgreementClause> clauses) {
        try {
            byte[] json = hashMapper.writeValueAsBytes(new HashedDeed(preamble, clauses));
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(json));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Could not hash agreement content", exception);
        }
    }

    /**
     * The exact shape that gets hashed.
     *
     * <p>A named record rather than a Map or an array, because the hash of an
     * accepted agreement must never move: a Map's serialisation order is not a
     * guarantee, and a record's component order is fixed by its declaration.
     */
    private record HashedDeed(AgreementPreamble preamble, List<AgreementClause> clauses) {
    }
}
