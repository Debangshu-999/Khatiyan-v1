package com.khatiyan.d_modules.expense.listener;

import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.modulith.events.ApplicationModuleListener;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.d_modules.billing.event.DepositPayoutEvent;
import com.khatiyan.d_modules.expense.model.Expense;
import com.khatiyan.d_modules.expense.model.ExpenseCategoryType;
import com.khatiyan.d_modules.expense.model.ExpenseSourceRefType;
import com.khatiyan.d_modules.expense.repository.ExpenseRepository;
import com.khatiyan.d_modules.expense.service.ExpenseCategoryService;

import lombok.extern.slf4j.Slf4j;

/**
 * Records committed deposit refunds as AUTO expense ledger rows. Idempotent on
 * the settlement movement id — the existence check catches replays and the
 * partial unique index on (source_ref_type, source_ref_id) catches races.
 */
@Slf4j
@Component
public class DepositExpenseEventListener {

    private final ExpenseRepository expenseRepository;
    private final ExpenseCategoryService categoryService;
    private final AuthModule authModule;

    public DepositExpenseEventListener(
            ExpenseRepository expenseRepository,
            ExpenseCategoryService categoryService,
            AuthModule authModule) {
        this.expenseRepository = expenseRepository;
        this.categoryService = categoryService;
        this.authModule = authModule;
    }

    @ApplicationModuleListener
    public void onDepositPayout(DepositPayoutEvent event) {
        if (expenseRepository.findBySourceRefTypeAndSourceRefId(
                ExpenseSourceRefType.DEPOSIT_MOVEMENT, event.depositMovementId()).isPresent()) {
            return;
        }

        UUID categoryId = categoryService.systemCategoryId(event.propertyId(), ExpenseCategoryType.DEPOSIT_PAYOUT);
        String paidTo = authModule.findById(event.tenantUserId())
                .map(UserSummaryResponse::fullName)
                .filter(name -> name != null && !name.isBlank())
                .orElse("Tenant");

        try {
            Expense saved = expenseRepository.save(Expense.auto(
                    event.propertyId(),
                    categoryId,
                    paidTo,
                    event.amountPaise(),
                    event.paidOutOn(),
                    ExpenseSourceRefType.DEPOSIT_MOVEMENT,
                    event.depositMovementId(),
                    event.reason()));
            log.info(
                    "Deposit payout recorded as expense expenseId={} propertyId={} tenancyId={} movementId={} amount={}",
                    saved.getId(),
                    event.propertyId(),
                    event.tenancyId(),
                    event.depositMovementId(),
                    event.amountPaise());
        } catch (DataIntegrityViolationException duplicate) {
            log.info(
                    "Deposit payout expense already recorded movementId={} propertyId={}",
                    event.depositMovementId(),
                    event.propertyId());
        }
    }
}
