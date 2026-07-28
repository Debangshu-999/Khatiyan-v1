import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

export type IncomeEntryType = "MANUAL" | "REVERSAL";

export type IncomeEntry = {
  id: string;
  source: string;
  receivedFrom: string | null;
  amountPaise: number;
  receivedDate: string;
  entryType: IncomeEntryType;
  description: string | null;
  reversesIncomeId: string | null;
  reversed: boolean;
  createdAt: string;
};

export type PnlLine = {
  label: string;
  amountPaise: number;
};

export type PnlStatement = {
  month: string;
  hasData: boolean;

  billRentCount: number;
  billRentPaise: number;
  billOneOffCount: number;
  billOneOffPaise: number;
  billBilledPaise: number;
  billCollectedPaise: number;
  billUncollectedPaise: number;

  manualIncomePaise: number;
  manualIncomeBreakdown: PnlLine[];

  totalIncomePaise: number;
  totalRealizedIncomePaise: number;

  expensePaise: number;
  expenseBreakdown: PnlLine[];

  netPaise: number;
  netRealizedPaise: number;
};

export type PnlTrendPoint = {
  month: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
};

export type PnlTrend = {
  points: PnlTrendPoint[];
};

export type CreateIncomePayload = {
  source: string;
  receivedFrom?: string;
  amountPaise: number;
  receivedDate: string;
  description?: string;
};

const base = (propertyId: string) => `/api/v1/properties/${propertyId}`;

export const pnlApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPnlStatement: builder.query<PnlStatement, { propertyId: string; month: string }>({
      query: ({ propertyId, month }) => ({ url: `${base(propertyId)}/pnl`, params: { month } }),
      // P&L reads billing + expense + income; income mutations invalidate it, and
      // it also refetches on mount for live billing/expense changes elsewhere.
      providesTags: ["Pnl"],
    }),
    getPnlTrend: builder.query<PnlTrend, { propertyId: string; month: string; months?: number }>({
      query: ({ propertyId, month, months = 6 }) => ({ url: `${base(propertyId)}/pnl/trend`, params: { month, months } }),
      providesTags: ["Pnl"],
    }),
    exportPnlReport: builder.query<string, { propertyId: string; month: string }>({
      query: ({ propertyId, month }) => ({
        params: { month },
        responseHandler: "text",
        url: `${base(propertyId)}/pnl/export`,
      }),
    }),

    listIncome: builder.query<Page<IncomeEntry>, { propertyId: string; month: string; page: number; size?: number }>({
      query: ({ propertyId, month, page, size = 20 }) => ({ url: `${base(propertyId)}/incomes`, params: { month, page, size } }),
      providesTags: ["Pnl"],
    }),
    createIncome: builder.mutation<IncomeEntry, { propertyId: string; payload: CreateIncomePayload }>({
      query: ({ propertyId, payload }) => ({ body: payload, method: "POST", url: `${base(propertyId)}/incomes` }),
      invalidatesTags: ["Pnl"],
    }),
    reverseIncome: builder.mutation<IncomeEntry, { propertyId: string; incomeId: string; reason: string }>({
      query: ({ propertyId, incomeId, reason }) => ({ body: { reason }, method: "POST", url: `${base(propertyId)}/incomes/${incomeId}/reverse` }),
      invalidatesTags: ["Pnl"],
    }),
  }),
});

export const {
  useGetPnlStatementQuery,
  useGetPnlTrendQuery,
  useLazyExportPnlReportQuery,
  useListIncomeQuery,
  useCreateIncomeMutation,
  useReverseIncomeMutation,
} = pnlApi;
