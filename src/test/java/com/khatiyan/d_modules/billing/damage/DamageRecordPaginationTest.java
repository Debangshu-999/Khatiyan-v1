package com.khatiyan.d_modules.billing.damage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.property.model.ManagerResource;

class DamageRecordPaginationTest {
    private final UUID actor = UUID.randomUUID();
    private final UUID property = UUID.randomUUID();
    private final UUID room = UUID.randomUUID();
    private final DamageRecordRepository records = mock(DamageRecordRepository.class);
    private final PropertyModule properties = mock(PropertyModule.class);
    private final AuthModule auth = mock(AuthModule.class);
    private final DamageRecordService service = new DamageRecordService(records, null, null, properties, null, auth, null, null);

    @Test
    void databasePagesStayOrderedAndCountersDescribeTheWholeProperty() {
        var first = record();
        var second = record();
        var ids = List.of(first.getId(), second.getId());
        when(records.findPageIds(eq(property), eq(EnumSet.of(DamageRecordStatus.OPEN)), any(), any(), any()))
                .thenReturn(new PageImpl<>(ids, PageRequest.of(1, 2), 7));
        // Fetch joins need not return the same order as the scalar page.
        when(records.findPageRecords(ids)).thenReturn(List.of(second, first));
        when(properties.findRoomsForDisplay(eq(property), anySet())).thenReturn(Map.of());
        when(auth.findByIds(anySet())).thenReturn(Map.of());
        counters(7, 4, 3);

        var result = service.page(actor, property, false, 1, 2);

        assertThat(result.records().items()).extracting(item -> item.id()).containsExactlyElementsOf(ids);
        assertThat(result.records().page()).isEqualTo(1);
        assertThat(result.records().size()).isEqualTo(2);
        assertThat(result.records().totalElements()).isEqualTo(7);
        assertThat(result.records().hasNext()).isTrue();
        assertThat(result.openCount()).isEqualTo(7);
        assertThat(result.historyCount()).isEqualTo(4);
        assertThat(result.notChargedCount()).isEqualTo(3);
        verify(records, never()).findByPropertyIdAndStatusInOrderByCodeDescSplitNumberAsc(any(), anyCollection());
    }

    @Test
    void historyUsesOnlyRepairedAndReplacedAndEmptyPagesDoNotFetchAllRecords() {
        var statuses = EnumSet.of(DamageRecordStatus.REPAIRED, DamageRecordStatus.REPLACED);
        when(records.findPageIds(eq(property), eq(statuses), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(3, 10), 21));
        counters(0, 21, 0);

        var result = service.page(actor, property, true, 3, 10);

        assertThat(result.records().items()).isEmpty();
        assertThat(result.records().hasNext()).isFalse();
        assertThat(result.records().hasPrevious()).isTrue();
        verify(records, never()).findPageRecords(anyCollection());
        verifyNoInteractions(auth);
    }

    @Test
    void clampsNegativePagesAndOversizedRequests() {
        when(records.findPageIds(eq(property), anyCollection(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 50), 0));
        counters(0, 0, 0);

        service.page(actor, property, false, -4, 10000);

        var page = ArgumentCaptor.forClass(Pageable.class);
        verify(records).findPageIds(eq(property), anyCollection(), any(), any(), page.capture());
        assertThat(page.getValue().getPageNumber()).isZero();
        assertThat(page.getValue().getPageSize()).isEqualTo(50);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aSearchAndADamageLevelNarrowTheDatabasePage() {
        // The owner's sticky search and level dropdown (user, 2026-11-14), done in the
        // query so a match on a later page is found too.
        when(records.findPageIds(eq(property), anyCollection(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));
        counters(0, 0, 0);

        service.page(actor, property, false, "  FaN ", DamageLevel.D1, 0, 10);
        service.page(actor, property, false, null, null, 0, 10);

        var levels = ArgumentCaptor.forClass(java.util.Collection.class);
        var pattern = ArgumentCaptor.forClass(String.class);
        verify(records, org.mockito.Mockito.times(2))
                .findPageIds(eq(property), anyCollection(), levels.capture(), pattern.capture(), any());
        assertThat(pattern.getAllValues()).containsExactly("%fan%", "%");
        assertThat(levels.getAllValues().get(0)).containsExactly(DamageLevel.D1);
        assertThat(levels.getAllValues().get(1)).containsExactlyInAnyOrder((Object[]) DamageLevel.values());
    }

    @Test
    void accessIsCheckedBeforeAnyRecordsAreRead() {
        doThrow(new IllegalStateException("No access")).when(properties).ensureCanViewAny(actor, property,
                ManagerResource.TENANCY_RULES, ManagerResource.TENANCIES, ManagerResource.DEPOSITS);

        assertThatThrownBy(() -> service.page(actor, property, false, 0, 10)).hasMessage("No access");

        verifyNoInteractions(records, auth);
    }

    private DamageRecord record() {
        var record = mock(DamageRecord.class);
        when(record.getId()).thenReturn(UUID.randomUUID());
        when(record.getRoomId()).thenReturn(room);
        when(record.getCreatedBy()).thenReturn(actor);
        when(record.getPhotoUrls()).thenReturn(List.of());
        when(record.getShares()).thenReturn(List.of());
        return record;
    }

    private void counters(long open, long history, long uncharged) {
        var counts = mock(DamageRecordRepository.Counts.class);
        when(counts.getOpenCount()).thenReturn(open);
        when(counts.getHistoryCount()).thenReturn(history);
        when(counts.getNotChargedCount()).thenReturn(uncharged);
        when(records.countForProperty(property)).thenReturn(counts);
    }
}
