package com.khatiyan.d_modules.discovery.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.discovery.api.dto.CreateCustomCategoryRequest;
import com.khatiyan.d_modules.discovery.api.dto.CreateCustomSubcategoryRequest;
import com.khatiyan.d_modules.discovery.api.dto.LocalPlaceCategoryResponse;
import com.khatiyan.d_modules.discovery.api.dto.LocalPlaceSubcategoryResponse;
import com.khatiyan.d_modules.discovery.model.LocalPlaceCategory;
import com.khatiyan.d_modules.discovery.model.LocalPlaceSubcategory;
import com.khatiyan.d_modules.discovery.repository.LocalPlaceCategoryRepository;
import com.khatiyan.d_modules.discovery.repository.LocalPlaceSubcategoryRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

@Service
public class LocalPlaceTaxonomyService {

    private final LocalPlaceCategoryRepository categoryRepository;
    private final LocalPlaceSubcategoryRepository subcategoryRepository;
    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;

    public LocalPlaceTaxonomyService(
            LocalPlaceCategoryRepository categoryRepository,
            LocalPlaceSubcategoryRepository subcategoryRepository,
            PropertyModule propertyModule,
            TenancyModule tenancyModule) {
        this.categoryRepository = categoryRepository;
        this.subcategoryRepository = subcategoryRepository;
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
    }

    /** Taxonomy for the active-tenant's property (custom rows of that property included). */
    @Transactional(readOnly = true)
    public List<LocalPlaceCategoryResponse> listMyTaxonomy(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancyForUser_", tenantUserId));
        return listTaxonomy(tenancy.propertyId());
    }

    /** Curated categories, each with curated + this property's custom subcategories. */
    @Transactional(readOnly = true)
    public List<LocalPlaceCategoryResponse> listTaxonomy(UUID propertyId) {
        Map<UUID, List<LocalPlaceSubcategoryResponse>> byCategory = subcategoryRepository
                .findVisibleForProperty(propertyId).stream()
                .sorted((a, b) -> Integer.compare(a.getDisplayOrder(), b.getDisplayOrder()))
                .map(LocalPlaceSubcategoryResponse::from)
                .collect(Collectors.groupingBy(LocalPlaceSubcategoryResponse::categoryId));

        return categoryRepository.findVisibleForProperty(propertyId).stream()
                .map(category -> new LocalPlaceCategoryResponse(
                        category.getId(),
                        category.getSlug(),
                        category.getName(),
                        category.getDisplayOrder(),
                        byCategory.getOrDefault(category.getId(), List.of())))
                .toList();
    }

    @Transactional
    public LocalPlaceCategoryResponse createCustomCategory(
            UUID actorUserId, UUID propertyId, CreateCustomCategoryRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isBlank()) {
            throw new ValidationException("Category name is required");
        }
        LocalPlaceCategory saved = categoryRepository.save(LocalPlaceCategory.custom(name, propertyId));
        return new LocalPlaceCategoryResponse(
                saved.getId(), saved.getSlug(), saved.getName(), saved.getDisplayOrder(), List.of());
    }

    @Transactional
    public LocalPlaceSubcategoryResponse createCustom(
            UUID actorUserId, UUID propertyId, CreateCustomSubcategoryRequest request) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new NotFoundException("LocalPlaceCategory_", request.categoryId()));

        String name = request.name() == null ? "" : request.name().trim();
        if (name.isBlank()) {
            throw new ValidationException("Subcategory name is required");
        }

        LocalPlaceSubcategory saved = subcategoryRepository.save(
                LocalPlaceSubcategory.custom(request.categoryId(), name, propertyId));
        return LocalPlaceSubcategoryResponse.from(saved);
    }
}
