package com.khatiyan.d_modules.notice.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.notice.api.dto.CreatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.api.dto.UpdatePropertyBoardItemRequest;
import com.khatiyan.d_modules.notice.model.PropertyBoardCategory;
import com.khatiyan.d_modules.notice.model.PropertyBoardItem;
import com.khatiyan.d_modules.notice.repository.PropertyBoardCategoryRepository;
import com.khatiyan.d_modules.notice.repository.PropertyBoardItemRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;

@ExtendWith(MockitoExtension.class)
class PropertyBoardServiceTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock
    private PropertyModule propertyModule;

    @Mock
    private PropertyBoardAccessPolicy accessPolicy;

    @Mock
    private TenancyModule tenancyModule;

    @Mock
    private PropertyBoardCategoryRepository categoryRepository;

    @Mock
    private PropertyBoardItemRepository itemRepository;

    private PropertyBoardService service;

    @BeforeEach
    void setUp() {
        service = new PropertyBoardService(
                propertyModule,
                accessPolicy,
                tenancyModule,
                categoryRepository,
                itemRepository);
    }

    @Test
    void creatingAnItemRefreshesItsCategoryActivity() {
        PropertyBoardCategory category = category("Rules");
        when(categoryRepository.findCategoryById(category.getId())).thenReturn(Optional.of(category));
        when(itemRepository.save(any(PropertyBoardItem.class))).thenAnswer(call -> call.getArgument(0));

        service.createItem(
                ACTOR,
                PROPERTY,
                new CreatePropertyBoardItemRequest(
                        category.getId(),
                        "Keep it clean",
                        "Please leave shared spaces tidy.",
                        0));

        assertThat(category.getUpdatedAt()).isNotNull();
    }

    @Test
    void movingAnItemRefreshesBothAffectedCategories() {
        PropertyBoardCategory source = category("General");
        PropertyBoardCategory destination = category("Visitors");
        PropertyBoardItem item = PropertyBoardItem.create(
                PROPERTY,
                ACTOR,
                source,
                "Visitor hours",
                "Visitors may arrive before 9 PM.",
                0);

        when(itemRepository.findBoardItemById(item.getId())).thenReturn(Optional.of(item));
        when(categoryRepository.findCategoryById(destination.getId())).thenReturn(Optional.of(destination));

        service.updateItem(
                ACTOR,
                item.getId(),
                new UpdatePropertyBoardItemRequest(
                        destination.getId(),
                        "Visitor hours",
                        "Visitors may arrive before 8 PM.",
                        0));

        assertThat(source.getUpdatedAt()).isNotNull();
        assertThat(destination.getUpdatedAt()).isNotNull();
        assertThat(item.getCategory()).isSameAs(destination);
    }

    @Test
    void deactivatingAnItemRefreshesItsCategoryActivity() {
        PropertyBoardCategory category = category("Facilities");
        PropertyBoardItem item = PropertyBoardItem.create(
                PROPERTY,
                ACTOR,
                category,
                "Gym hours",
                "The gym closes at 10 PM.",
                0);
        when(itemRepository.findBoardItemById(item.getId())).thenReturn(Optional.of(item));

        service.deactivateItem(ACTOR, item.getId());

        assertThat(item.isCurrentlyActive()).isFalse();
        assertThat(category.getUpdatedAt()).isNotNull();
    }

    private PropertyBoardCategory category(String name) {
        return PropertyBoardCategory.create(
                PROPERTY,
                ACTOR,
                name,
                name.toLowerCase(),
                0);
    }
}
