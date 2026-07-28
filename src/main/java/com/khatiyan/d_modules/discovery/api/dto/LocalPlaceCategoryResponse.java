package com.khatiyan.d_modules.discovery.api.dto;

import java.util.List;
import java.util.UUID;

public record LocalPlaceCategoryResponse(
        UUID id,
        String slug,
        String name,
        int displayOrder,
        List<LocalPlaceSubcategoryResponse> subcategories) {
}
