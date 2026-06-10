package com.khatiyan.d_modules.discovery.service;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khatiyan.d_modules.discovery.api.dto.LocationAreaResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocationCityResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocationSuggestionResponse;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class LocationCatalogService {

    private static final String CATALOG_PATH = "data/india-locations.json";

    private final ObjectMapper objectMapper;
    private List<LocationCityResponse> cities = List.of();
    private List<LocationAreaResponse> areas = List.of();
    private List<LocationSuggestionResponse> suggestions = List.of();

    public LocationCatalogService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    void loadCatalog() throws IOException {
        LocationCatalogFile file = objectMapper.readValue(
                new ClassPathResource(CATALOG_PATH).getInputStream(),
                LocationCatalogFile.class);

        List<LocationCityResponse> nextCities = new ArrayList<>();
        List<LocationAreaResponse> nextAreas = new ArrayList<>();
        List<LocationSuggestionResponse> nextSuggestions = new ArrayList<>();

        for (LocationCityFile city : file.cities()) {
            LocationCityResponse cityResponse = new LocationCityResponse(
                    city.name(),
                    city.state(),
                    city.latitude(),
                    city.longitude());
            nextCities.add(cityResponse);
            nextSuggestions.add(new LocationSuggestionResponse(
                    city.name() + ", " + city.state(),
                    city.name(),
                    city.state(),
                    null,
                    city.latitude(),
                    city.longitude()));

            for (String area : city.areas()) {
                nextAreas.add(new LocationAreaResponse(
                        city.name(),
                        city.state(),
                        area,
                        city.latitude(),
                        city.longitude()));
                nextSuggestions.add(new LocationSuggestionResponse(
                        area + ", " + city.name(),
                        city.name(),
                        city.state(),
                        area,
                        city.latitude(),
                        city.longitude()));
            }
        }

        cities = nextCities.stream()
                .sorted(Comparator.comparing(LocationCityResponse::city, String.CASE_INSENSITIVE_ORDER))
                .toList();
        areas = nextAreas.stream()
                .sorted(Comparator
                        .comparing(LocationAreaResponse::city, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(LocationAreaResponse::area, String.CASE_INSENSITIVE_ORDER))
                .toList();
        suggestions = nextSuggestions.stream()
                .sorted(Comparator.comparing(LocationSuggestionResponse::label, String.CASE_INSENSITIVE_ORDER))
                .toList();

        log.info("Location catalog loaded cities={} areas={}", cities.size(), areas.size());
    }

    public List<LocationSuggestionResponse> suggest(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }

        String normalizedQuery = normalize(query);
        return suggestions.stream()
                .filter(suggestion -> normalize(suggestion.label()).contains(normalizedQuery)
                        || normalize(suggestion.city()).contains(normalizedQuery)
                        || normalize(suggestion.state()).contains(normalizedQuery)
                        || (suggestion.area() != null && normalize(suggestion.area()).contains(normalizedQuery)))
                .limit(12)
                .toList();
    }

    public List<LocationCityResponse> listCities() {
        return cities;
    }

    public List<LocationAreaResponse> listAreas(String city) {
        if (city == null || city.isBlank()) {
            return List.of();
        }

        String normalizedCity = normalize(city);
        return areas.stream()
                .filter(area -> normalize(area.city()).equals(normalizedCity))
                .toList();
    }

    private String normalize(String value) {
        return value.trim().toLowerCase();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record LocationCatalogFile(List<LocationCityFile> cities) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record LocationCityFile(
            String name,
            String state,
            BigDecimal latitude,
            BigDecimal longitude,
            List<String> areas
    ) {
    }
}
