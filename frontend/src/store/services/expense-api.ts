import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

export type ExpenseEntryType = "MANUAL" | "RECURRING" | "AUTO" | "REVERSAL";

export type Expense = {
  id: string;
  categoryId: string | null;
  categoryName: string;
  paidTo: string;
  amountPaise: number;
  incurredDate: string;
  entryType: ExpenseEntryType;
  description: string | null;
  reversesExpenseId: string | null;
  reversed: boolean;
  createdAt: string;
};

export type ExpenseCategoryTotal = {
  categoryId: string | null;
  categoryName: string;
  amountPaise: number;
};

export type ExpenseMonthSummary = {
  month: string;
  totalSpentPaise: number;
  budgetPaise: number | null;
  byCategory: ExpenseCategoryTotal[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  system: boolean;
  active: boolean;
};

export type BudgetRaiseItem = {
  id: string;
  amountPaise: number;
  reason: string | null;
  createdAt: string;
};

export type ExpenseBudgetOverview = {
  month: string;
  defaultMonthlyBudgetPaise: number | null;
  raisedThisMonthPaise: number;
  effectiveBudgetPaise: number | null;
  spentPaise: number;
  remainingPaise: number | null;
  savingsPaise: number;
  raises: BudgetRaiseItem[];
};

export type ExpenseBudgetTrendPoint = {
  month: string;
  spentPaise: number;
  effectiveBudgetPaise: number | null;
  savingsPaise: number;
  raisedPaise: number;
};

export type ExpenseBudgetTrend = {
  points: ExpenseBudgetTrendPoint[];
};

export type RecurringExpense = {
  id: string;
  categoryId: string | null;
  categoryName: string;
  paidTo: string;
  amountPaise: number;
  description: string | null;
  dayOfMonth: number;
  active: boolean;
  lastGeneratedMonth: string | null;
  // Derived by the platform (projected salary) — read-only, no edit/deactivate.
  system: boolean;
};

export type CreateExpensePayload = {
  categoryId: string;
  paidTo: string;
  amountPaise: number;
  incurredDate: string;
  description?: string;
};

export type RecurringExpensePayload = {
  categoryId: string;
  paidTo: string;
  amountPaise: number;
  dayOfMonth: number;
  description?: string;
};

const base = (propertyId: string) => `/api/v1/properties/${propertyId}`;

export const expenseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getExpenseSummary: builder.query<ExpenseMonthSummary, { propertyId: string; month: string }>({
      query: ({ propertyId, month }) => ({ url: `${base(propertyId)}/expenses/summary`, params: { month } }),
      providesTags: ["Expense"],
    }),
    listExpenses: builder.query<Page<Expense>, { propertyId: string; month: string; page: number; size?: number }>({
      query: ({ propertyId, month, page, size = 20 }) => ({ url: `${base(propertyId)}/expenses`, params: { month, page, size } }),
      providesTags: ["Expense"],
    }),
    createExpense: builder.mutation<Expense, { propertyId: string; payload: CreateExpensePayload }>({
      query: ({ propertyId, payload }) => ({ body: payload, method: "POST", url: `${base(propertyId)}/expenses` }),
      invalidatesTags: ["Expense"],
    }),
    reverseExpense: builder.mutation<Expense, { propertyId: string; expenseId: string; reason: string }>({
      query: ({ propertyId, expenseId, reason }) => ({ body: { reason }, method: "POST", url: `${base(propertyId)}/expenses/${expenseId}/reverse` }),
      invalidatesTags: ["Expense"],
    }),

    listExpenseCategories: builder.query<ExpenseCategory[], string>({
      query: (propertyId) => `${base(propertyId)}/expense-categories`,
      providesTags: ["Expense"],
    }),
    createExpenseCategory: builder.mutation<ExpenseCategory, { propertyId: string; name: string }>({
      query: ({ propertyId, name }) => ({ body: { name }, method: "POST", url: `${base(propertyId)}/expense-categories` }),
      invalidatesTags: ["Expense"],
    }),
    renameExpenseCategory: builder.mutation<ExpenseCategory, { propertyId: string; categoryId: string; name: string }>({
      query: ({ propertyId, categoryId, name }) => ({ body: { name }, method: "PATCH", url: `${base(propertyId)}/expense-categories/${categoryId}` }),
      invalidatesTags: ["Expense"],
    }),
    deactivateExpenseCategory: builder.mutation<void, { propertyId: string; categoryId: string }>({
      query: ({ propertyId, categoryId }) => ({ method: "DELETE", url: `${base(propertyId)}/expense-categories/${categoryId}` }),
      invalidatesTags: ["Expense"],
    }),

    getBudgetOverview: builder.query<ExpenseBudgetOverview, { propertyId: string; month: string }>({
      query: ({ propertyId, month }) => ({ url: `${base(propertyId)}/expense-budget`, params: { month } }),
      providesTags: ["Expense"],
    }),
    setDefaultBudget: builder.mutation<ExpenseBudgetOverview, { propertyId: string; month: string; amountPaise: number }>({
      query: ({ propertyId, month, amountPaise }) => ({ body: { amountPaise }, method: "PUT", url: `${base(propertyId)}/expense-budget`, params: { month } }),
      invalidatesTags: ["Expense"],
    }),
    raiseBudget: builder.mutation<ExpenseBudgetOverview, { propertyId: string; month: string; amountPaise: number; reason?: string }>({
      query: ({ propertyId, month, amountPaise, reason }) => ({ body: { month, amountPaise, reason }, method: "POST", url: `${base(propertyId)}/expense-budget/raises` }),
      invalidatesTags: ["Expense"],
    }),
    getBudgetTrend: builder.query<ExpenseBudgetTrend, { propertyId: string; month: string; months?: number }>({
      query: ({ propertyId, month, months = 6 }) => ({ url: `${base(propertyId)}/expense-budget/trend`, params: { month, months } }),
      providesTags: ["Expense"],
    }),

    listRecurringExpenses: builder.query<RecurringExpense[], string>({
      query: (propertyId) => `${base(propertyId)}/recurring-expenses`,
      providesTags: ["Expense"],
    }),
    createRecurringExpense: builder.mutation<RecurringExpense, { propertyId: string; payload: RecurringExpensePayload }>({
      query: ({ propertyId, payload }) => ({ body: payload, method: "POST", url: `${base(propertyId)}/recurring-expenses` }),
      invalidatesTags: ["Expense"],
    }),
    updateRecurringExpense: builder.mutation<RecurringExpense, { propertyId: string; recurringExpenseId: string; payload: RecurringExpensePayload }>({
      query: ({ propertyId, recurringExpenseId, payload }) => ({ body: payload, method: "PATCH", url: `${base(propertyId)}/recurring-expenses/${recurringExpenseId}` }),
      invalidatesTags: ["Expense"],
    }),
    deactivateRecurringExpense: builder.mutation<void, { propertyId: string; recurringExpenseId: string }>({
      query: ({ propertyId, recurringExpenseId }) => ({ method: "DELETE", url: `${base(propertyId)}/recurring-expenses/${recurringExpenseId}` }),
      invalidatesTags: ["Expense"],
    }),
  }),
});

export const {
  useGetExpenseSummaryQuery,
  useListExpensesQuery,
  useCreateExpenseMutation,
  useReverseExpenseMutation,
  useListExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useRenameExpenseCategoryMutation,
  useDeactivateExpenseCategoryMutation,
  useGetBudgetOverviewQuery,
  useGetBudgetTrendQuery,
  useSetDefaultBudgetMutation,
  useRaiseBudgetMutation,
  useListRecurringExpensesQuery,
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  useDeactivateRecurringExpenseMutation,
} = expenseApi;
