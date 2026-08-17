package com.khatiyan.d_modules.notice.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notice.api.dto.CreatePropertyBoardCategoryRequest;
import com.khatiyan.d_modules.notice.api.dto.CreatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.api.dto.PropertyBoardCategoryResponse;
import com.khatiyan.d_modules.notice.api.dto.PropertyBoardItemResponse;
import com.khatiyan.d_modules.notice.api.dto.UpdatePropertyBoardCategoryRequest;
import com.khatiyan.d_modules.notice.api.dto.UpdatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.model.PropertyBoardCategory;
import com.khatiyan.d_modules.notice.model.PropertyBoardItem;
import com.khatiyan.d_modules.notice.repository.PropertyBoardCategoryRepository;
import com.khatiyan.d_modules.notice.repository.PropertyBoardItemRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

/**
 * Application service for long-lived property board content.
 *
 * <p>The property board is the stable dashboard for information such as rules,
 * timings, contacts, and recurring instructions. It is separate from notices,
 * which are time-bound announcements.
 */
@Service
public class PropertyBoardService {

    private final PropertyModule propertyModule;
    private final PropertyBoardAccessPolicy propertyBoardAccessPolicy;
    private final TenancyModule tenancyModule;
    private final PropertyBoardCategoryRepository categoryRepository;
    private final PropertyBoardItemRepository itemRepository;

    public PropertyBoardService(
            PropertyModule propertyModule,
            PropertyBoardAccessPolicy propertyBoardAccessPolicy,
            TenancyModule tenancyModule,
            PropertyBoardCategoryRepository categoryRepository,
            PropertyBoardItemRepository itemRepository) {
        this.propertyModule = propertyModule;
        this.propertyBoardAccessPolicy = propertyBoardAccessPolicy;
        this.tenancyModule = tenancyModule;
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
    }

    // Admin side property board category actions

    /**
     * Creates a new property board category for a property manager or owner.
     */
    @Transactional
    public PropertyBoardCategoryResponse createCategory(
            UUID actorUserId,
            UUID propertyId,
            CreatePropertyBoardCategoryRequest request) {
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, propertyId);
        ensureSlugAvailable(propertyId, request.slug());

        PropertyBoardCategory category = PropertyBoardCategory.create(
                propertyId,
                actorUserId,
                request.name(),
                request.slug(),
                defaultOrder(request.displayOrder()));

        return PropertyBoardCategoryResponse.from(categoryRepository.save(category));
    }

    /**
     * Lists active board categories for a property visible to management.
     */
    @Transactional(readOnly = true)
    public List<PropertyBoardCategoryResponse> listActiveCategories(UUID actorUserId, UUID propertyId) {
        propertyBoardAccessPolicy.ensureCanViewBoard(actorUserId, propertyId);

        return categoryRepository.findActiveByPropertyId(propertyId)
                .stream()
                .map(category -> PropertyBoardCategoryResponse.from(category))
                .toList();
    }

    /**
     * Updates the label, slug, and ordering of an active board category.
     */
    @Transactional
    public PropertyBoardCategoryResponse updateCategory(
            UUID actorUserId,
            UUID categoryId,
            UpdatePropertyBoardCategoryRequest request) {
        PropertyBoardCategory category = getCategory(categoryId);
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, category.getPropertyId());

        if (!category.getSlug().equals(request.slug())) {
            ensureSlugAvailable(category.getPropertyId(), request.slug());
        }

        category.updateDetails(request.name(), request.slug(), request.displayOrder());
        return PropertyBoardCategoryResponse.from(category);
    }

    /**
     * Deactivates a board category without deleting the row.
     */
    @Transactional
    public void deactivateCategory(UUID actorUserId, UUID categoryId) {
        PropertyBoardCategory category = getCategory(categoryId);
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, category.getPropertyId());
        category.deactivate();
    }
    //----------------------------------------------------------------------------------------------------------------------------------------------------
    
    // Admin side property board item actions

    /**
     * Creates a stable board item under an active category.
     */
    @Transactional
    public PropertyBoardItemResponse createItem(
            UUID actorUserId,
            UUID propertyId,
            CreatePropertyBoardItemRequest request) {
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, propertyId);
        PropertyBoardCategory category = getActiveCategoryForProperty(propertyId, request.categoryId());

        PropertyBoardItem item = PropertyBoardItem.create(
                propertyId,
                actorUserId,
                category,
                request.title(),
                request.body(),
                defaultOrder(request.displayOrder()));

        return PropertyBoardItemResponse.from(itemRepository.save(item));
    }

    /**
     * Lists every active board item for a property.
     */
    @Transactional(readOnly = true)
    public List<PropertyBoardItemResponse> listActiveItems(UUID actorUserId, UUID propertyId) {
        propertyBoardAccessPolicy.ensureCanViewBoard(actorUserId, propertyId);

        return itemRepository.findActiveByPropertyId(propertyId)
                .stream()
                .map(item -> PropertyBoardItemResponse.from(item))
                .toList();
    }

    /**
     * Lists active board items under one category.
     */
    @Transactional(readOnly = true)
    public List<PropertyBoardItemResponse> listActiveItemsByCategory(
            UUID actorUserId,
            UUID propertyId,
            UUID categoryId) {
        propertyBoardAccessPolicy.ensureCanViewBoard(actorUserId, propertyId);
        getActiveCategoryForProperty(propertyId, categoryId);

        return itemRepository.findActiveByPropertyIdAndCategoryId(propertyId, categoryId)
                .stream()
                .map(item -> PropertyBoardItemResponse.from(item))
                .toList();
    }

    /**
     * Lists active board items for the authenticated tenant's current property.
     */
    @Transactional(readOnly = true)
    public List<PropertyBoardItemResponse> listActiveItemsForTenant(UUID tenantUserId) {
        TenancyResponse tenancy = tenancyModule.findActiveByUserId(tenantUserId)
                .orElseThrow(() -> new ValidationException("Tenant has no active tenancy"));

        return itemRepository.findActiveByPropertyId(tenancy.propertyId())
                .stream()
                .map(item -> PropertyBoardItemResponse.from(item))
                .toList();
    }

    /**
     * Updates the category, content, and order of a board item.
     */
    @Transactional
    public PropertyBoardItemResponse updateItem(
            UUID actorUserId,
            UUID itemId,
            UpdatePropertyBoardItemRequest request) {
        PropertyBoardItem item = getItem(itemId);
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, item.getPropertyId());
        PropertyBoardCategory category = getActiveCategoryForProperty(
                item.getPropertyId(),
                request.categoryId());

        item.updateDetails(
                category,
                request.title(),
                request.body(),
                request.displayOrder());

        return PropertyBoardItemResponse.from(item);
    }

    /**
     * Deactivates a board item without deleting the row.
     */
    @Transactional
    public void deactivateItem(UUID actorUserId, UUID itemId) {
        PropertyBoardItem item = getItem(itemId);
        propertyBoardAccessPolicy.ensureCanManageBoard(actorUserId, item.getPropertyId());
        item.deactivate();
    }

    private PropertyBoardCategory getCategory(UUID categoryId) {
        return categoryRepository.findCategoryById(categoryId)
                .orElseThrow(() -> new NotFoundException("PropertyBoardCategory", categoryId));
    }

    private PropertyBoardItem getItem(UUID itemId) {
        return itemRepository.findBoardItemById(itemId)
                .orElseThrow(() -> new NotFoundException("PropertyBoardItem", itemId));
    }

    private PropertyBoardCategory getActiveCategoryForProperty(UUID propertyId, UUID categoryId) {
        PropertyBoardCategory category = getCategory(categoryId);

        if (!category.isCurrentlyActive() || !category.getPropertyId().equals(propertyId)) {
            throw new ValidationException("Category does not belong to this property");
        }

        return category;
    }

    private void ensureSlugAvailable(UUID propertyId, String slug) {
        if (categoryRepository.findActiveByPropertyIdAndSlug(propertyId, slug).isPresent()) {
            throw new ValidationException("Notice board category slug already exists for this property");
        }
    }

    private int defaultOrder(Integer displayOrder) {
        return displayOrder == null ? 0 : displayOrder;
    }
}
