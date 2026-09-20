package com.khatiyan.d_modules.intelligence.discovery;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.d_modules.discovery.DiscoveryModule;
import com.khatiyan.d_modules.discovery.api.dto.PropertyDiscoveryCardResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchRequest;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse;
import com.khatiyan.d_modules.intelligence.api.dto.InterpretSearchResponse.SearchArgs;
import com.khatiyan.d_modules.intelligence.api.dto.SmartSearchResponse;
import com.khatiyan.d_modules.intelligence.api.dto.SmartSearchResponse.SmartSearchListing;
import com.khatiyan.d_modules.intelligence.audit.AiCapability;
import com.khatiyan.d_modules.intelligence.audit.AiInvocation;
import com.khatiyan.d_modules.intelligence.audit.AiInvocationAuditService;
import com.khatiyan.d_modules.intelligence.discovery.LandmarkResolver.LandmarkSet;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchRanker.Ranked;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchRanker.Scored;
import com.khatiyan.d_modules.intelligence.discovery.SmartSearchService.Interpretation;

/**
 * Answers a sentence: reads it, places it, looks up what it named, searches,
 * ranks, and explains.
 *
 * <p>This is the piece that makes smart search more than filter-parsing. A
 * sentence can ask for something no column holds ("near a metro") and something
 * no filter exposes (a hostel, a lift, a deposit ceiling), and both are served
 * — the first by resolving real places at search time, the second by scoring
 * against data every listing already carries.
 *
 * <p><b>The candidate query deliberately carries almost no filters.</b> The
 * discovery search treats attribute filters as an OR gate: set any, and a
 * listing matching none of them is dropped. That is right for the filter sheet
 * and wrong here, because a listing that misses a preference is exactly what
 * belongs in the related section with the miss named. So only what must be
 * absolute is passed down — the region, and the budget — and everything else is
 * decided by {@link SmartSearchRanker} where it can be explained.
 */
@Service
@ConditionalOnProperty(prefix = "app.ai", name = "enabled", havingValue = "true")
public class SmartSearchResultsService {

    /**
     * How many listings are pulled back to rank.
     *
     * <p>Generous because the ranking happens here rather than in the query:
     * the related section can only contain what was fetched. A city with more
     * published listings than this will need the ranking pushed into the query
     * itself, which is a real limit and not a today problem.
     */
    private static final int CANDIDATE_PAGE_SIZE = 200;

    /** Lines are written for the page somebody reads, across both sections. */
    private static final int REASON_BUDGET = 10;

    private final SmartSearchService smartSearchService;
    private final DiscoveryModule discoveryModule;
    private final LandmarkResolver landmarkResolver;
    private final SmartSearchRanker ranker;
    private final SmartSearchReasonWriter reasonWriter;
    private final SmartSearchCache cache;
    private final AiInvocationAuditService auditService;

    public SmartSearchResultsService(
            SmartSearchService smartSearchService,
            DiscoveryModule discoveryModule,
            LandmarkResolver landmarkResolver,
            SmartSearchRanker ranker,
            SmartSearchReasonWriter reasonWriter,
            SmartSearchCache cache,
            AiInvocationAuditService auditService) {
        this.smartSearchService = smartSearchService;
        this.discoveryModule = discoveryModule;
        this.landmarkResolver = landmarkResolver;
        this.ranker = ranker;
        this.reasonWriter = reasonWriter;
        this.cache = cache;
        this.auditService = auditService;
    }

    /**
     * A repeat inside the answer window gets exactly what was shown last time.
     *
     * <p>No allowance spent, no model called, no listing fetched. Case, spacing
     * and punctuation do not make a search new — see {@link SmartSearchCache}.
     */
    public SmartSearchResponse search(UUID actorUserId, InterpretSearchRequest request) {
        long startedAt = System.currentTimeMillis();
        SmartSearchResponse repeat = cache.answer(request).orElse(null);
        if (repeat != null) {
            auditService.record(AiInvocation.fromCache(
                    AiCapability.SMART_SEARCH,
                    actorUserId,
                    (int) Math.min(Integer.MAX_VALUE, System.currentTimeMillis() - startedAt)));
            return repeat;
        }
        return answer(actorUserId, request);
    }

    private SmartSearchResponse answer(UUID actorUserId, InterpretSearchRequest request) {
        Interpretation interpretation = smartSearchService.interpreted(actorUserId, request);
        InterpretSearchResponse interpreted = interpretation.response();
        SearchArgs args = interpreted.searchArgs();
        String landmarkText = interpretation.landmarkText();

        List<String> unresolved = new ArrayList<>(interpreted.unresolvedRequirements());

        // Nothing to search without a place. The filters it did understand are
        // still returned, so the client can show them and say what is missing.
        if (interpreted.status() != InterpretStatus.READY) {
            SmartSearchResponse unanswerable =
                    assemble(interpreted, interpretation, null, unresolved, List.of(), List.of());
            cache.putAnswer(request, unanswerable);
            return unanswerable;
        }

        LandmarkSet landmarks = null;
        if (landmarkText != null) {
            landmarks = landmarkResolver
                    .resolve(landmarkText, args.latitude(), args.longitude())
                    .filter(set -> !set.isEmpty())
                    .orElse(null);
            if (landmarks == null) {
                // Said plainly rather than silently searching the whole region
                // as though the requirement had been met.
                unresolved.add("Nothing called \"" + landmarkText + "\" could be found around there.");
            }
        }

        // A stated distance belongs to whatever was named. With a landmark it
        // is how near the landmark counts as near, and the query must not also
        // apply it around the region's centre — that would cut out listings
        // sitting right beside a station on the edge of the city.
        Double statedKm = args.radiusKm() == null ? null : args.radiusKm().doubleValue();
        Double queryRadiusKm = landmarks == null ? statedKm : null;

        // Where each card's "X km" is measured from. The device, like every
        // other search, so the number means distance from the person reading it
        // and nearest-first means nearest to them. Only a stated radius with no
        // landmark keeps the named place, because that radius is drawn around it.
        boolean fromDevice = request.hasDevice() && queryRadiusKm == null;
        BigDecimal measureLatitude = fromDevice ? BigDecimal.valueOf(request.device().latitude()) : args.latitude();
        BigDecimal measureLongitude = fromDevice ? BigDecimal.valueOf(request.device().longitude()) : args.longitude();

        PageResponse<PropertyDiscoveryCardResponse> page = discoveryModule.searchVisibleProperties(
                args.state(),
                args.city(),
                null,
                args.locality(),
                measureLatitude,
                measureLongitude,
                queryRadiusKm,
                null,
                args.minRentPaise(),
                args.maxRentPaise(),
                null,
                null,
                List.of(),
                null,
                null,
                List.of(),
                0,
                CANDIDATE_PAGE_SIZE);

        // Measured landmarks cost a vendor call per listing. Ask for them all at
        // once, before ranking walks the list one listing at a time.
        if (landmarks instanceof LandmarkResolver.Measured measured) {
            List<BigDecimal[]> points = page.items().stream()
                    .filter(item -> item.latitude() != null && item.longitude() != null)
                    .map(item -> new BigDecimal[] {item.latitude(), item.longitude()})
                    .toList();
            measured.warm(points);
            // Only a verdict when something was measured. With no listings to
            // measure from, "no metro station around there" was a false report
            // about the city laid on top of an empty search.
            if (!points.isEmpty() && !measured.foundAny()) {
                // A city with no metro at all is not a city where every listing
                // is a weak match. Say it could not be found and search without it.
                unresolved.add("No " + landmarks.label() + " could be found around there.");
                landmarks = null;
            }
        }

        Ranked ranked = ranker.rank(page.items(), args, interpretation.preferences(), landmarks, statedKm);

        // The matching section first: those are the answers, and if the budget
        // runs out it should run out on the ones nobody scrolled to.
        List<Scored> explained = Stream.concat(ranked.matching().stream(), ranked.related().stream())
                .limit(REASON_BUDGET)
                .toList();
        Map<UUID, String> reasons = reasonWriter.write(request.query(), explained, actorUserId);

        SmartSearchResponse response = assemble(
                interpreted,
                interpretation,
                landmarks,
                unresolved,
                listings(ranked.matching(), reasons),
                listings(ranked.related(), reasons));

        // Not remembered when the reason lines failed — most often a provider
        // rate limit. Keeping that answer would hand every repeat for fifteen
        // minutes the same cards with nothing written under them, when the
        // next attempt would very likely get its lines.
        if (explained.isEmpty() || !reasons.isEmpty()) {
            cache.putAnswer(request, response);
        }
        return response;
    }

    private SmartSearchResponse assemble(
            InterpretSearchResponse interpreted,
            Interpretation interpretation,
            LandmarkSet landmarks,
            List<String> unresolved,
            List<SmartSearchListing> matching,
            List<SmartSearchListing> related) {
        return new SmartSearchResponse(
                interpreted.intentVersion(),
                interpreted.status(),
                interpreted.resolvedLocation(),
                landmarks == null ? null : landmarks.label(),
                interpreted.searchArgs(),
                // The chip names what was MEASURED FROM, not what was typed.
                // A named landmark resolves to the closest thing the geocoder
                // has, and that is not always the place somebody meant —
                // "Sister Nivedita University" resolves to a same-named hostel
                // ten kilometres away, because the university is not in the
                // index at all. Printing the resolved name is what makes that
                // visible instead of silently answering a different question.
                SmartSearchRanker.describe(
                        interpreted.searchArgs(),
                        interpretation.preferences(),
                        landmarks != null ? landmarks.label() : interpretation.landmarkText()),
                List.copyOf(unresolved),
                interpreted.conflicts(),
                matching,
                related);
    }

    private List<SmartSearchListing> listings(List<Scored> scored, Map<UUID, String> reasons) {
        return scored.stream()
                .map(entry -> new SmartSearchListing(
                        entry.property(),
                        entry.matchedTags(),
                        entry.missedTags(),
                        entry.requirementCount(),
                        entry.nearestLandmark() == null ? null : entry.nearestLandmark().name(),
                        entry.nearestLandmark() == null ? null : round(entry.nearestLandmark().distanceKm()),
                        entry.strength(),
                        reasons.get(entry.property().propertyId())))
                .toList();
    }

    /**
     * Three decimals, which is metres.
     *
     * <p>Two was a decimal too few: 0.126 km became 0.13, and the card then
     * printed "130 m" in its distance chip beside a reason line saying "126 m"
     * — the same measurement, twice, disagreeing.
     */
    private static Double round(double km) {
        return BigDecimal.valueOf(km).setScale(3, java.math.RoundingMode.HALF_UP).doubleValue();
    }
}
