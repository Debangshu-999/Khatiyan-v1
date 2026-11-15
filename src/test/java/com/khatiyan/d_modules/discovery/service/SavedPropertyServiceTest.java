package com.khatiyan.d_modules.discovery.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.discovery.model.SavedProperty;
import com.khatiyan.d_modules.discovery.repository.SavedPropertyRepository;

/** Saved properties (user, 2026-11-14): save, remove and list, idempotent both ways. */
@ExtendWith(MockitoExtension.class)
class SavedPropertyServiceTest {

    private static final UUID USER = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();

    @Mock
    private SavedPropertyRepository repository;

    @Mock
    private PropertyDiscoveryService discovery;

    @InjectMocks
    private SavedPropertyService service;

    @Test
    void savingAListedPropertyRecordsIt() {
        when(discovery.isVisible(PROPERTY)).thenReturn(true);

        service.save(USER, PROPERTY);

        ArgumentCaptor<SavedProperty> saved = ArgumentCaptor.forClass(SavedProperty.class);
        verify(repository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(USER);
        assertThat(saved.getValue().getPropertyId()).isEqualTo(PROPERTY);
    }

    @Test
    void savingTwiceIsANoOp() {
        when(discovery.isVisible(PROPERTY)).thenReturn(true);
        when(repository.existsByUserIdAndPropertyId(USER, PROPERTY)).thenReturn(true);

        service.save(USER, PROPERTY);

        verify(repository, never()).saveAndFlush(any());
    }

    /** Two taps at once: the second insert hits the unique index and is ignored. */
    @Test
    void aRacingDuplicateIsIgnored() {
        when(discovery.isVisible(PROPERTY)).thenReturn(true);
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("uq_saved_properties_user_property"));

        service.save(USER, PROPERTY);
    }

    @Test
    void aPropertyNoLongerListedCannotBeSaved() {
        when(discovery.isVisible(PROPERTY)).thenReturn(false);

        assertThatThrownBy(() -> service.save(USER, PROPERTY))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining(PROPERTY.toString());
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void removingDeletesTheRow() {
        service.remove(USER, PROPERTY);

        verify(repository).deleteByUserIdAndPropertyId(USER, PROPERTY);
    }

    /** The list is the saved ids, newest first, turned into cards in that order. */
    @Test
    void theListIsTheCardsOfTheSavedIdsInSavedOrder() {
        UUID older = UUID.randomUUID();
        when(repository.findPropertyIdsNewestFirst(USER)).thenReturn(List.of(PROPERTY, older));
        java.math.BigDecimal latitude = new java.math.BigDecimal("22.58");
        java.math.BigDecimal longitude = new java.math.BigDecimal("88.47");
        when(discovery.cardsFor(List.of(PROPERTY, older), latitude, longitude)).thenReturn(List.of());

        assertThat(service.list(USER, latitude, longitude)).isEmpty();
        verify(discovery).cardsFor(List.of(PROPERTY, older), latitude, longitude);
    }
}
