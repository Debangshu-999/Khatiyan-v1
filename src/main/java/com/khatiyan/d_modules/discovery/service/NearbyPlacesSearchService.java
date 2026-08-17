package com.khatiyan.d_modules.discovery.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.discovery.api.dto.NearbyPlacesResponse;
import com.khatiyan.d_modules.discovery.api.dto.PropertyLocalPlaceResponse;
import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;
import com.khatiyan.d_modules.discovery.repository.LocalPlaceSubcategoryRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Smart search over a property's curated nearby places. A query resolves to
 * matching subcategories (by name + curated keywords, typo-tolerant); places in
 * a matched subcategory are "direct" results, and other places in the same
 * category are "related" (so "medicine" surfaces pharmacies directly and
 * hospitals/clinics as related).
 */
@Service
public class NearbyPlacesSearchService {

    private final PropertyLocalPlaceService localPlaceService;
    private final LocalPlaceSubcategoryRepository subcategoryRepository;
    private final PropertyModule propertyModule;
    private final DiscoveryAccessPolicy discoveryAccessPolicy;
    private final TenancyModule tenancyModule;

    public NearbyPlacesSearchService(
            PropertyLocalPlaceService localPlaceService,
            LocalPlaceSubcategoryRepository subcategoryRepository,
            PropertyModule propertyModule,
            DiscoveryAccessPolicy discoveryAccessPolicy,
            TenancyModule tenancyModule) {
        this.localPlaceService = localPlaceService;
        this.subcategoryRepository = subcategoryRepository;
        this.propertyModule = propertyModule;
        this.discoveryAccessPolicy = discoveryAccessPolicy;
        this.tenancyModule = tenancyModule;
    }

    @Transactional(readOnly = true)
    public NearbyPlacesResponse searchManaged(
            UUID actorUserId, UUID propertyId, String query, BigDecimal latitude, BigDecimal longitude) {
        discoveryAccessPolicy.ensureCanViewNearbyPlaces(actorUserId, propertyId);
        return search(propertyId, query, latitude, longitude);
    }

    @Transactional(readOnly = true)
    public NearbyPlacesResponse searchMine(
            UUID tenantUserId, String query, BigDecimal latitude, BigDecimal longitude) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancyForUser", tenantUserId));
        return search(tenancy.propertyId(), query, latitude, longitude);
    }

    private NearbyPlacesResponse search(UUID propertyId, String query, BigDecimal latitude, BigDecimal longitude) {
        List<PropertyLocalPlaceResponse> places = localPlaceService.listActiveForProperty(propertyId, latitude, longitude);

        String term = query == null ? "" : query.trim().toLowerCase();
        if (term.isBlank()) {
            return new NearbyPlacesResponse(places, List.of());
        }

        List<LocalPlaceSubcategory> subcategories = subcategoryRepository.findVisibleForProperty(propertyId);
        Map<UUID, UUID> subToCategory = subcategories.stream()
                .collect(Collectors.toMap(LocalPlaceSubcategory::getId, LocalPlaceSubcategory::getCategoryId, (a, b) -> a));

        Set<UUID> matchedSubIds = subcategories.stream()
                .filter(subcategory -> matchesTerm(subcategory.getName(), subcategory.getKeywords(), term))
                .map(LocalPlaceSubcategory::getId)
                .collect(Collectors.toSet());
        Set<UUID> matchedCategoryIds = matchedSubIds.stream()
                .map(subToCategory::get)
                .collect(Collectors.toSet());

        List<PropertyLocalPlaceResponse> direct = places.stream()
                .filter(place -> place.name().toLowerCase().contains(term)
                        || place.subcategoryIds().stream().anyMatch(matchedSubIds::contains))
                .toList();
        Set<UUID> directIds = direct.stream().map(PropertyLocalPlaceResponse::id).collect(Collectors.toSet());

        List<PropertyLocalPlaceResponse> related = places.stream()
                .filter(place -> !directIds.contains(place.id()))
                .filter(place -> place.subcategoryIds().stream()
                        .map(subToCategory::get)
                        .anyMatch(matchedCategoryIds::contains))
                .toList();

        return new NearbyPlacesResponse(direct, related);
    }

    /**
     * True when the term matches the subcategory: its name or any comma-separated
     * keyword contains the term, or any word of the name/keywords is within a
     * length-scaled edit distance (typo tolerance).
     */
    static boolean matchesTerm(String name, String keywords, String rawTerm) {
        String term = rawTerm == null ? "" : rawTerm.trim().toLowerCase();
        if (term.isBlank()) {
            return false;
        }
        String normalizedName = name == null ? "" : name.toLowerCase();
        if (normalizedName.contains(term)) {
            return true;
        }
        String normalizedKeywords = keywords == null ? "" : keywords.toLowerCase();
        for (String keyword : normalizedKeywords.split(",")) {
            if (!keyword.isBlank() && keyword.trim().contains(term)) {
                return true;
            }
        }
        int allowed = allowedEditDistance(term);
        if (allowed == 0) {
            return false;
        }
        String haystack = normalizedName + " " + normalizedKeywords.replace(',', ' ');
        for (String word : haystack.split("[,\\s]+")) {
            if (!word.isBlank() && editDistanceAtMost(word, term, allowed)) {
                return true;
            }
        }
        return false;
    }

    private static int allowedEditDistance(String token) {
        if (token.length() >= 6) {
            return 2;
        }
        if (token.length() >= 4) {
            return 1;
        }
        return 0;
    }

    /** Banded Levenshtein: true when distance(a, b) &lt;= max, with early exit. */
    private static boolean editDistanceAtMost(String a, String b, int max) {
        if (Math.abs(a.length() - b.length()) > max) {
            return false;
        }
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            int rowMin = current[0];
            for (int j = 1; j <= b.length(); j++) {
                int substitution = previous[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1);
                current[j] = Math.min(substitution, Math.min(previous[j] + 1, current[j - 1] + 1));
                rowMin = Math.min(rowMin, current[j]);
            }
            if (rowMin > max) {
                return false;
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()] <= max;
    }
}
