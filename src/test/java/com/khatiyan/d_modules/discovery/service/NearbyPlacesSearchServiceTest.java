package com.khatiyan.d_modules.discovery.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class NearbyPlacesSearchServiceTest {

    @Test
    void medicineMatchesPharmacyViaKeyword() {
        assertTrue(NearbyPlacesSearchService.matchesTerm("Pharmacy", "medicine,chemist", "medicine"));
    }

    @Test
    void busStandMatchesByName() {
        assertTrue(NearbyPlacesSearchService.matchesTerm("Bus stand", "bus,bus stop", "bus stand"));
    }

    @Test
    void unrelatedTermDoesNotMatch() {
        assertFalse(NearbyPlacesSearchService.matchesTerm("Gym", "gym,workout", "pharmacy"));
    }

    @Test
    void typoToleratedForLongerTerms() {
        assertTrue(NearbyPlacesSearchService.matchesTerm("Pharmacy", "medicine", "medcine"));
    }
}
