package com.khatiyan.d_modules.expense.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.expense.api.dto.CreateIncomeRequest;
import com.khatiyan.d_modules.expense.api.dto.IncomeResponse;
import com.khatiyan.d_modules.expense.api.dto.PnlLine;
import com.khatiyan.d_modules.expense.api.dto.ReverseIncomeRequest;
import com.khatiyan.d_modules.expense.model.IncomeEntry;
import com.khatiyan.d_modules.expense.model.IncomeEntryType;
import com.khatiyan.d_modules.expense.repository.IncomeEntryRepository;

/** Manual income entry, corrections (reversal), paginated history and rollups. */
@Service
public class IncomeService {

    private final IncomeEntryRepository incomeRepository;
    private final FinanceAccessPolicy financeAccessPolicy;

    public IncomeService(IncomeEntryRepository incomeRepository, FinanceAccessPolicy financeAccessPolicy) {
        this.incomeRepository = incomeRepository;
        this.financeAccessPolicy = financeAccessPolicy;
    }

    @Transactional
    public IncomeResponse createManual(UUID actorUserId, UUID propertyId, CreateIncomeRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        IncomeEntry income = incomeRepository.save(IncomeEntry.manual(
                propertyId, request.source(), request.receivedFrom(), request.amountPaise(),
                request.receivedDate(), request.description(), actorUserId));
        return IncomeResponse.from(income, false);
    }

    @Transactional
    public IncomeResponse reverse(UUID actorUserId, UUID propertyId, UUID incomeId, ReverseIncomeRequest request) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        IncomeEntry original = incomeRepository.findByIdAndPropertyId(incomeId, propertyId)
                .orElseThrow(() -> new NotFoundException("IncomeEntry", incomeId));
        if (original.getEntryType() == IncomeEntryType.REVERSAL) {
            throw new ValidationException("A reversal cannot be reversed");
        }
        if (incomeRepository.existsByReversesIncomeId(original.getId())) {
            throw new ValidationException("This income entry has already been reversed");
        }
        IncomeEntry reversal = incomeRepository.save(
                IncomeEntry.reversalOf(original, request.reason(), actorUserId, LocalDate.now()));
        return IncomeResponse.from(reversal, false);
    }

    @Transactional(readOnly = true)
    public PageResponse<IncomeResponse> listIncome(
            UUID actorUserId, UUID propertyId, LocalDate month, int page, int size) {
        financeAccessPolicy.ensureCanUseExpenses(actorUserId, propertyId);
        YearMonth yearMonth = YearMonth.from(month);
        List<IncomeEntry> entries = incomeRepository.findForPeriod(
                propertyId, yearMonth.atDay(1), yearMonth.plusMonths(1).atDay(1));
        Set<UUID> reversedIds = entries.stream()
                .map(IncomeEntry::getReversesIncomeId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        List<IncomeResponse> items = entries.stream()
                .map(entry -> IncomeResponse.from(entry, reversedIds.contains(entry.getId())))
                .toList();
        return PageResponse.of(items, page, size);
    }

    /** Net manual income for a month — internal read for P&L (no auth check). */
    @Transactional(readOnly = true)
    public long monthlyTotalPaise(UUID propertyId, YearMonth month) {
        return incomeRepository.sumNetForPeriod(propertyId, month.atDay(1), month.plusMonths(1).atDay(1));
    }

    /** Net manual income grouped by source, largest first — internal read for P&L. */
    @Transactional(readOnly = true)
    public List<PnlLine> monthlyBreakdown(UUID propertyId, YearMonth month) {
        List<IncomeEntry> entries = incomeRepository.findForPeriod(
                propertyId, month.atDay(1), month.plusMonths(1).atDay(1));
        Map<String, Long> totals = new LinkedHashMap<>();
        for (IncomeEntry entry : entries) {
            totals.merge(entry.getSource(), entry.getAmountPaise(), Long::sum);
        }
        return totals.entrySet().stream()
                .filter(e -> e.getValue() != 0)
                .map(e -> new PnlLine(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(PnlLine::amountPaise).reversed())
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
