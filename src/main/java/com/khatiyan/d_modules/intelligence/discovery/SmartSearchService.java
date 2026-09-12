package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.cfg.EnumFeature;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.type.LogicalType;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.geo.GeoModule;
import com.khatiyan.d_modules.geo.api.dto.GeoSuggestionResponse;
import com.khatiyan.d_modules.geo.api.dto.ReverseGeocodeResponse;
import com.khatiyan.d_modules.intelligence.IntelligenceProperties;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchRequest;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.ResolvedLocation;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.intelligence.audit.AiCapability;
import com.khatiyan.d_modules.intelligence.audit.AiInvocation;
import com.khatiyan.d_modules.intelligence.audit.AiInvocationAuditService;
import com.khatiyan.d_modules.intelligence.audit.AiProvider;
import com.khatiyan.d_modules.intelligence.provider.AiQuotaService;

/**
 * Reads a sentence and answers with filters the existing search can run.
 *
 * <p><b>The sentence never leaves this module.</b> What goes to discovery is a
 * set of typed arguments, each one validated. That is the whole safety
 * argument: a model that misunderstands produces a wrong filter, which the
 * person can see and remove, rather than an opaque query nobody can inspect.
 *
 * <p><b>Nothing here is guessed.</b> A place that resolves several ways comes
 * back as candidates to choose from. A "near me" with no coordinates comes back
 * asking for them. A place outside India comes back saying so. In every one of
 * those cases the filters are still returned, because failing to find a place
 * is no reason to discard the rest of what somebody said.
 *
 * <p><b>Order matters.</b> Quota first, before a single token is spent — a
 * refusal must cost nothing. Then the model. Then geocoding, through the same
 * cache-backed path the typed search uses, so one phrase cannot resolve two
 * ways depending on who asked.
 */
@Service
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class SmartSearchService {

    private static final Logger log = LoggerFactory.getLogger(SmartSearchService.class);

    /**
     * Bumped whenever this prompt, the draft schema or the mapping changes.
     *
     * <p>It is part of the cache key, so an interpretation produced by an older
     * version is never replayed against newer rules.
     */
    static final String INTENT_VERSION = "discovery-intent-v7";

    /**
     * English only for now.
     *
     * <p>Hinglish is genuinely common in this market and is an open decision
     * (O6 in the spec). It is left out of v1 deliberately rather than by
     * omission: it needs its own golden set before it can be claimed to work,
     * and a model quietly half-understanding "ladkon ka PG" is worse than one
     * that puts the phrase in the unsupported list.
     */
    private static final String SYSTEM_PROMPT = """
            You read one sentence from someone looking for a PG or hostel room in India,
            and report only what the sentence actually says.

            Rules:
            - Never invent a value. If the sentence does not say it, leave it null or empty.
            - Never return coordinates. Put the place exactly as written into locationText.
            - anchor is PLACE when a place is named, DEVICE for "near me" or "around here",
              and NONE when no location is mentioned.
            - Rent is a monthly figure in rupees. "12k" is 12000. "under 12k" is a maximum.
            - maxDepositRupees is the deposit, not the rent, and only when a deposit is
              named.
            - propertyType is what KIND of place was asked for. "PG" or "paying guest"
              is PG, "hostel" is HOSTEL, "flat" or "apartment" is APARTMENT. Somebody
              who says PG does not want a hostel.
            - facilities is what the place itself must have: wifi, a lift, a gym,
              parking, air conditioning, hot water, power backup, a study area. Only
              what the sentence names.
            - landmarkText is what the stay should be NEAR. Either a kind of place —
              "metro station", "railway station", "college", "hospital", "market",
              "airport", "bus stand" — or the NAME of one, such as "Sister Nivedita
              University" or "Acropolis Mall". Write it as they wrote it, without the
              word near. It is not the place the search is IN, which is locationText:
              "PG near a metro in Salt Lake" has locationText "Salt Lake" and
              landmarkText "metro", and "PG near Sister Nivedita University in Kolkata"
              has locationText "Kolkata" and landmarkText "Sister Nivedita University".
              Leave it null when nothing is mentioned.
            - Put any requirement you cannot express in the other fields into
              unsupportedPhrases, word for word, and do not approximate it with a field
              that means something else.
            - There is no field for a lock-in period, a notice period, a rating, or how
              nice an area is. A sentence asking for any of those must repeat that part
              in unsupportedPhrases. Dropping it silently is the worst answer you can
              give: the search then shows results that ignore what was asked with
              nothing on screen to say so.
            - confidence is your own estimate between 0 and 1.

            Worked example. For "pg in kolkata" every field is null or empty except
            locationText "kolkata", propertyType PG and anchor PLACE. The sentence says
            nothing about food, electricity, bathrooms, sharing, rent, facilities, a
            deposit, a landmark or who it is for, so none of those may carry a value —
            not even false, not even ANYONE, not even an empty string.

            Second example. For "boys pg near metro in salt lake kolkata under 9000 with
            wifi": locationText "salt lake kolkata", landmarkText "metro", propertyType
            PG, pgFor MALE, maxRentRupees 9000, facilities [WIFI], anchor PLACE. Nothing
            else.
            """;

    private final OpenAiChatModel groqFastChatModel;
    private final DiscoveryIntentMapper mapper;
    private final GeoModule geoModule;
    private final AiQuotaService quotaService;
    private final AiInvocationAuditService auditService;
    private final IntelligenceProperties properties;

    public SmartSearchService(
            OpenAiChatModel groqFastChatModel,
            DiscoveryIntentMapper mapper,
            GeoModule geoModule,
            AiQuotaService quotaService,
            AiInvocationAuditService auditService,
            IntelligenceProperties properties) {
        this.groqFastChatModel = groqFastChatModel;
        this.mapper = mapper;
        this.geoModule = geoModule;
        this.quotaService = quotaService;
        this.auditService = auditService;
        this.properties = properties;
    }

    /**
     * An interpretation, with the parts a caller running the search also needs.
     *
     * <p>The response alone is not enough for that: it carries filters and a
     * place, but the landmark to measure against and the preferences to score
     * by are not filters and have no home in it. Rather than smuggle them
     * through the wire shape and parse our own output back, the one caller that
     * needs them gets them directly.
     */
    record Interpretation(
            InterpretSearchResponse response,
            /** What to be near, as written. Resolving it is the caller's job. */
            String landmarkText,
            DiscoveryIntentMapper.AttributePreferences preferences) {
    }

    public InterpretSearchResponse interpret(UUID actorUserId, InterpretSearchRequest request) {
        return interpreted(actorUserId, request).response();
    }

    Interpretation interpreted(UUID actorUserId, InterpretSearchRequest request) {
        if (!properties.smartSearchLive()) {
            throw new ValidationException("Smart search is not available right now.");
        }

        String query = normalise(request.query());
        if (query.isBlank()) {
            throw new ValidationException("Type what you are looking for.");
        }

        // Before any token is spent. A refusal has to be free, or the thing
        // protecting the budget is itself spending it.
        quotaService.claimSmartSearch(actorUserId);

        long startedAt = System.currentTimeMillis();
        DiscoveryIntentDraft draft = askModel(query, actorUserId, startedAt);
        // The sentence goes in with the draft: the airlock needs it to tell a
        // requirement somebody typed from a field the model filled in anyway.
        DiscoveryIntentMapper.MappedIntent mapped = mapper.map(draft, query);

        return new Interpretation(
                resolveLocation(actorUserId, request, draft, mapped),
                mapped.landmarkText(),
                mapped.preferences());
    }

    /**
     * Reads the model's JSON into a draft, forgiving the ways a model says
     * "nothing here".
     *
     * <p>The schema sent with the request already names every allowed enum
     * value, and the model still answers {@code "bathroomType": ""} for a
     * sentence that mentioned no bathroom. Strict deserialization treats that
     * as a type error and throws — so one blank field threw away an entire
     * correct reading of somebody's sentence and showed them a failure. Three
     * kinds of slip are absorbed here instead:
     *
     * <ul>
     *   <li>an empty string where an enum belongs, read as "not stated";
     *   <li>a value outside the enum, read the same way rather than fatally;
     *   <li>a field we do not have, ignored — a model that invents
     *       {@code deposit} must not take the rest of the sentence down with
     *       it.
     * </ul>
     *
     * <p>None of this makes the model's output trusted. Every value still
     * passes the airlock in {@link DiscoveryIntentMapper}, which is what
     * decides whether a figure is sane and reports what it could not use. This
     * only stops a formatting slip from becoming an outage.
     */
    private static final BeanOutputConverter<DiscoveryIntentDraft> DRAFT_CONVERTER =
            new BeanOutputConverter<>(DiscoveryIntentDraft.class, JsonMapper.builder()
                    .withCoercionConfig(LogicalType.Enum, config ->
                            config.setCoercion(CoercionInputShape.EmptyString, CoercionAction.AsNull))
                    .enable(EnumFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL)
                    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .build());

    // ------------------------------------------------------------- the model

    private DiscoveryIntentDraft askModel(String query, UUID actorUserId, long startedAt) {
        String model = properties.providers().groq().models().structuredFast();
        try {
            DiscoveryIntentDraft draft = ask(query);

            if (draft == null) {
                throw new ValidationException("Could not read that search. Try rephrasing it.");
            }

            auditService.record(AiInvocation.answered(
                            AiCapability.SMART_SEARCH, AiProvider.GROQ, model, actorUserId,
                            null, null, elapsed(startedAt))
                    .withVersions(INTENT_VERSION, INTENT_VERSION, null));
            return draft;

        } catch (ValidationException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            // The provider failed, or returned something that would not fit the
            // schema. Recorded, then turned into a refusal — the ordinary
            // filters still work and saying so is more use than a stack trace.
            auditService.record(AiInvocation.failed(
                    AiCapability.SMART_SEARCH, AiProvider.GROQ, model, actorUserId,
                    com.khatiyan.d_modules.intelligence.audit.AiOutcome.PROVIDER_ERROR,
                    exception.getClass().getSimpleName(), elapsed(startedAt)));
            log.warn("Smart search interpretation failed", exception);
            throw new ValidationException("Smart search is unavailable right now. The filters still work.");
        }
    }

    /**
     * One call, and one retry if the provider answers with nothing at all.
     *
     * <p>"No content to map due to end-of-input" is an empty completion: the
     * request was fine and the model returned a blank body. Retrying the same
     * sentence usually works, and the alternative is telling somebody their
     * perfectly good search could not be read. Exactly one retry — a provider
     * that is genuinely down must not be hammered, and the budget is metered.
     */
    private DiscoveryIntentDraft ask(String query) {
        try {
            return call(query);
        } catch (RuntimeException first) {
            if (!isEmptyCompletion(first)) {
                throw first;
            }
            log.warn("Empty completion for a smart search, asking once more");
            return call(query);
        }
    }

    private DiscoveryIntentDraft call(String query) {
        return ChatClient.create(groqFastChatModel)
                .prompt()
                .system(SYSTEM_PROMPT)
                .user(query)
                .call()
                .entity(DRAFT_CONVERTER);
    }

    private static boolean isEmptyCompletion(RuntimeException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            String message = cause.getMessage();
            if (message != null && message.contains("No content to map")) {
                return true;
            }
        }
        return false;
    }

    // ---------------------------------------------------------- the location

    private InterpretSearchResponse resolveLocation(
            UUID actorUserId,
            InterpretSearchRequest request,
            DiscoveryIntentDraft draft,
            DiscoveryIntentMapper.MappedIntent mapped) {

        SearchAnchor anchor = draft.anchor() == null ? SearchAnchor.NONE : draft.anchor();

        if (anchor == SearchAnchor.NONE) {
            // No place mentioned. The discovery tab keeps the scope it had.
            return respond(InterpretStatus.READY, anchor, null, mapped, draft);
        }

        if (anchor == SearchAnchor.DEVICE) {
            if (!request.hasDevice()) {
                return respond(InterpretStatus.LOCATION_NEEDED, anchor, null, mapped, draft);
            }
            return fromPoint(actorUserId, anchor, null,
                    BigDecimal.valueOf(request.device().latitude()),
                    BigDecimal.valueOf(request.device().longitude()),
                    mapped, draft);
        }

        List<GeoSuggestionResponse> candidates = geoModule.systemSearch(draft.locationText());
        List<GeoSuggestionResponse> usable = candidates.stream()
                .filter(candidate -> candidate.latitude() != null && candidate.longitude() != null)
                .toList();

        if (usable.isEmpty()) {
            return respond(InterpretStatus.LOCATION_NOT_FOUND, anchor, null, mapped, draft);
        }

        // The top match, and no question asked.
        //
        // This used to hand back every match for the person to choose between,
        // on the reasoning that India repeats place names. In practice the
        // geocoder returns five points for ONE area — five roads inside Salt
        // Lake, all labelled "Salt Lake Bypass" — so the picker asked people to
        // choose between rows they could not tell apart, to answer a question
        // they had already answered by typing the name. Somebody who searches
        // Salt Lake is shown Salt Lake. The area they named is what scopes the
        // search (see fromPoint), so a neighbouring point off the same query
        // lands in the same place anyway.
        GeoSuggestionResponse place = usable.get(0);
        return fromPoint(actorUserId, anchor, draft.locationText(),
                BigDecimal.valueOf(place.latitude()), BigDecimal.valueOf(place.longitude()),
                mapped, draft);
    }

    /**
     * A point becomes a scoped search, never a bare point.
     *
     * <p>The reverse lookup is what supplies the region. Sending coordinates
     * without it once returned all-India results ordered by distance, with a
     * Hyderabad listing in a Kolkata search — so a point we cannot place is
     * treated as a location we could not find, rather than searched anyway.
     */
    private InterpretSearchResponse fromPoint(
            UUID actorUserId,
            SearchAnchor anchor,
            String namedPlace,
            BigDecimal latitude,
            BigDecimal longitude,
            DiscoveryIntentMapper.MappedIntent mapped,
            DiscoveryIntentDraft draft) {

        Optional<ReverseGeocodeResponse> region =
                geoModule.reverse(actorUserId, latitude.doubleValue(), longitude.doubleValue());

        if (region.isEmpty()) {
            return respond(InterpretStatus.LOCATION_NOT_FOUND, anchor, null, mapped, draft);
        }

        ReverseGeocodeResponse place = region.get();
        if (place.state() == null || place.state().isBlank()) {
            // Outside India, or somewhere the provider cannot place. Either way
            // there is nothing here to match, and the existing foreign-location
            // guard says the same thing on the typed path.
            return respond(InterpretStatus.OUTSIDE_INDIA, anchor, null, mapped, draft);
        }

        // What the PERSON named is what gets searched. Two ways the geocoder's
        // own answer for a point is the wrong scope, both of which showed up as
        // an empty screen over stock that was sitting right there:
        //
        //  - its locality is the administrative unit containing the point —
        //    "Sector IV" inside Salt Lake, "Ward 106 Serilingampally" for
        //    Gachibowli. No owner files a listing under a ward number.
        //  - its city is the municipal body, and those do not line up with the
        //    city people say. Salt Lake is legally Bidhannagar, so scoping a
        //    "PG in Salt Lake" search to city=Bidhannagar excluded every one of
        //    the listings filed, correctly, under Kolkata.
        //
        // So a named search is scoped by STATE and by the named text, and the
        // city is left out. The state is the guard that matters — it is what
        // keeps a Kolkata search off Bengaluru listings — and the discovery
        // search already matches the named text token by token against area,
        // city and state together, which is how "salt lake kolkata" finds a
        // Salt Lake property in Kolkata without either word having to be the
        // right KIND of name. A search anchored on the device names no place,
        // and there the geocoder's own locality is exactly right.
        boolean named = namedPlace != null && !namedPlace.isBlank();
        String city = named ? null : place.city();
        String locality = named ? namedPlace.trim() : place.locality();

        SearchArgs scoped = mapper.withLocation(
                mapped.searchArgs(), place.state(), city, locality, latitude, longitude);

        // Display keeps the geocoded city: it is the honest answer to "where
        // did you take me", even when it is not what scopes the query.
        ResolvedLocation resolved = new ResolvedLocation(
                place.formattedAddress(), locality, place.city(), place.state(), latitude, longitude);

        return new InterpretSearchResponse(
                INTENT_VERSION, InterpretStatus.READY, anchor, resolved, scoped,
                mapped.unresolvedRequirements(), mapped.conflicts(), draft.confidence());
    }

    // ------------------------------------------------------------- plumbing

    private InterpretSearchResponse respond(
            InterpretStatus status,
            SearchAnchor anchor,
            ResolvedLocation resolved,
            DiscoveryIntentMapper.MappedIntent mapped,
            DiscoveryIntentDraft draft) {
        return new InterpretSearchResponse(
                INTENT_VERSION, status, anchor, resolved, mapped.searchArgs(),
                mapped.unresolvedRequirements(), mapped.conflicts(), draft.confidence());
    }


    /** Trim, collapse runs of whitespace, and cap. Cheap, and done before the quota. */
    private String normalise(String query) {
        String collapsed = query == null ? "" : query.trim().replaceAll("\\s+", " ");
        int cap = properties.smartSearch().maxQueryChars();
        return collapsed.length() > cap ? collapsed.substring(0, cap) : collapsed;
    }

    private static int elapsed(long startedAt) {
        return (int) (System.currentTimeMillis() - startedAt);
    }
}
