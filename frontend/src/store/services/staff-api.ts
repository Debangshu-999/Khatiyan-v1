import { api } from "@/store/api";
import type { Page } from "@/store/pagination";

export type SalaryStructure = "DAILY" | "MONTHLY";
export type IdentityVerificationStatus = "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
export type SalaryAdjustmentType = "ADDITION" | "DEDUCTION";
export type SalaryPaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER";
export type SalaryPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type StaffCategory = {
  id: string;
  name: string;
  systemKey: string | null;
  system: boolean;
  active: boolean;
};

export type StaffMember = {
  referenceCode: string;
  categoryName: string;
  fullName: string;
  age: number | null;
  dateOfBirth: string | null;
  identityVerificationStatus: IdentityVerificationStatus;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  benefitsSummary: string;
  employmentStartDate: string;
  employmentEndDate: string | null;
  employmentNotes: string;
  active: boolean;
};

// Redacted staff view a manager is allowed to see (no employment record).
export type StaffMemberSummary = {
  referenceCode: string;
  fullName: string;
  categoryName: string;
  identityVerificationStatus: IdentityVerificationStatus;
  active: boolean;
};

export type ManagerEmployment = {
  id: string;
  referenceCode: string;
  managerUserId: string;
  fullName: string;
  phone: string;
  age: number | null;
  dateOfBirth: string | null;
  identityVerificationStatus: IdentityVerificationStatus;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  benefitsSummary: string;
  employmentStartDate: string;
  employmentEndDate: string | null;
  employmentNotes: string;
  active: boolean;
};

export type SalaryAdjustment = {
  id: string;
  adjustmentType: SalaryAdjustmentType;
  amountPaise: number;
  reason: string;
  createdAt: string;
};

export type SalaryPayment = {
  id: string;
  amountPaise: number;
  paidOn: string;
  paymentMethod: SalaryPaymentMethod;
  referenceText: string | null;
  notes: string;
};

export type SalaryMonth = {
  payrollMonth: string;
  openedOn: string;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  payableDays: number | null;
  baseAmountPaise: number;
  additionsAmountPaise: number;
  deductionsAmountPaise: number;
  grossAmountPaise: number;
  netAmountPaise: number;
  paidAmountPaise: number;
  paymentStatus: SalaryPaymentStatus;
  adjustments: SalaryAdjustment[];
  payments: SalaryPayment[];
};

export type SalaryAccount = {
  referenceCode: string;
  holderType: "MANAGER" | "STAFF_MEMBER";
  holderReferenceCode: string;
  holderName: string;
  categoryName: string;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  active: boolean;
  openedOn: string;
  settledOn: string | null;
  grossPayToDatePaise: number;
  netPayToDatePaise: number;
  paidToDatePaise: number;
};

export type SalaryAccountDetail = {
  account: SalaryAccount;
  months: SalaryMonth[];
};

export type CreateStaffMemberPayload = {
  categoryId: string;
  fullName: string;
  dateOfBirth?: string | null;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  benefitsSummary?: string;
  employmentStartDate: string;
  employmentEndDate?: string | null;
  employmentNotes?: string;
};

export type UpdateStaffMemberPayload = CreateStaffMemberPayload & {
  identityVerificationStatus: IdentityVerificationStatus;
};

export type UpdateManagerEmploymentPayload = Omit<UpdateStaffMemberPayload, "categoryId" | "fullName">;

export type TerminationPreview = {
  hasSalaryAccount: boolean;
  outstandingPaise: number;
  grossToDatePaise: number;
  paidToDatePaise: number;
};

export type EndEmploymentPayload = {
  reason: string;
  review?: string;
  additionalAmountPaise: number;
  paymentMethod?: SalaryPaymentMethod | null;
  paidOn?: string | null;
  settlementNotes?: string;
};

export type EmployeeHistoryItem = {
  holderType: "MANAGER" | "STAFF_MEMBER";
  referenceCode: string;
  fullName: string;
  categoryName: string;
  identityVerificationStatus: IdentityVerificationStatus;
  salaryStructure: SalaryStructure;
  salaryRatePaise: number;
  employmentStartDate: string;
  employmentEndDate: string | null;
  employmentEndReason: string | null;
  employmentReview: string | null;
  settledOn: string | null;
  settlementAmountPaise: number;
  totalPaidPaise: number;
};

export const staffApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listStaffCategories: builder.query<StaffCategory[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/categories`,
      providesTags: ["Staff"],
    }),
    createStaffCategory: builder.mutation<StaffCategory, { propertyId: string; name: string }>({
      query: ({ propertyId, name }) => ({ body: { name }, method: "POST", url: `/api/v1/properties/${propertyId}/staff/categories` }),
      invalidatesTags: ["Staff"],
    }),
    updateStaffCategory: builder.mutation<StaffCategory, { propertyId: string; categoryId: string; name: string }>({
      query: ({ propertyId, categoryId, name }) => ({ body: { name }, method: "PATCH", url: `/api/v1/properties/${propertyId}/staff/categories/${categoryId}` }),
      invalidatesTags: ["Staff"],
    }),
    deactivateStaffCategory: builder.mutation<void, { propertyId: string; categoryId: string }>({
      query: ({ propertyId, categoryId }) => ({ method: "DELETE", url: `/api/v1/properties/${propertyId}/staff/categories/${categoryId}` }),
      invalidatesTags: ["Staff"],
    }),
    listStaffMembers: builder.query<StaffMember[], { propertyId: string; includeInactive?: boolean }>({
      query: ({ propertyId, includeInactive = false }) => ({ params: { includeInactive }, url: `/api/v1/properties/${propertyId}/staff/members` }),
      providesTags: ["Staff"],
    }),
    createStaffMember: builder.mutation<StaffMember, { propertyId: string; payload: CreateStaffMemberPayload }>({
      query: ({ propertyId, payload }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/staff/members` }),
      invalidatesTags: ["Staff"],
    }),
    updateStaffMember: builder.mutation<StaffMember, { propertyId: string; staffReferenceCode: string; payload: UpdateStaffMemberPayload }>({
      query: ({ propertyId, staffReferenceCode, payload }) => ({ body: payload, method: "PATCH", url: `/api/v1/properties/${propertyId}/staff/members/${staffReferenceCode}` }),
      invalidatesTags: ["Staff"],
    }),
    staffTerminationPreview: builder.query<TerminationPreview, { propertyId: string; staffReferenceCode: string }>({
      query: ({ propertyId, staffReferenceCode }) => `/api/v1/properties/${propertyId}/staff/members/${staffReferenceCode}/termination-preview`,
      providesTags: ["Staff"],
    }),
    endStaffMember: builder.mutation<void, { propertyId: string; staffReferenceCode: string; payload: EndEmploymentPayload }>({
      query: ({ propertyId, staffReferenceCode, payload }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/staff/members/${staffReferenceCode}/end` }),
      invalidatesTags: ["Staff", "Notification"],
    }),
    managerTerminationPreview: builder.query<TerminationPreview, { propertyId: string; managerReferenceCode: string }>({
      query: ({ propertyId, managerReferenceCode }) => `/api/v1/properties/${propertyId}/staff/managers/${managerReferenceCode}/termination-preview`,
      providesTags: ["Staff"],
    }),
    endManagerEmployment: builder.mutation<void, { propertyId: string; managerReferenceCode: string; payload: EndEmploymentPayload }>({
      query: ({ propertyId, managerReferenceCode, payload }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/staff/managers/${managerReferenceCode}/end` }),
      invalidatesTags: ["Staff", "Property", "Notification"],
    }),
    listEmployeeHistory: builder.query<Page<EmployeeHistoryItem>, { propertyId: string; page?: number; size?: number }>({
      query: ({ page = 0, propertyId, size = 20 }) => ({ params: { page, size }, url: `/api/v1/properties/${propertyId}/staff/history` }),
      providesTags: ["Staff"],
    }),
    listManagerEmployment: builder.query<ManagerEmployment[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/managers`,
      providesTags: ["Staff"],
    }),
    updateManagerEmployment: builder.mutation<ManagerEmployment, { propertyId: string; managerReferenceCode: string; payload: UpdateManagerEmploymentPayload }>({
      query: ({ propertyId, managerReferenceCode, payload }) => ({ body: payload, method: "PATCH", url: `/api/v1/properties/${propertyId}/staff/managers/${managerReferenceCode}` }),
      invalidatesTags: ["Staff"],
    }),
    listSalaryAccounts: builder.query<SalaryAccount[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/salary-accounts`,
      providesTags: ["Staff"],
    }),
    openStaffSalaryAccount: builder.mutation<SalaryAccountDetail, { propertyId: string; staffReferenceCode: string }>({
      query: ({ propertyId, staffReferenceCode }) => ({ method: "POST", url: `/api/v1/properties/${propertyId}/staff/members/${staffReferenceCode}/salary-account` }),
      invalidatesTags: ["Staff"],
    }),
    openManagerSalaryAccount: builder.mutation<SalaryAccountDetail, { propertyId: string; managerReferenceCode: string }>({
      query: ({ propertyId, managerReferenceCode }) => ({ method: "POST", url: `/api/v1/properties/${propertyId}/staff/managers/${managerReferenceCode}/salary-account` }),
      invalidatesTags: ["Staff"],
    }),
    getSalaryAccount: builder.query<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string }>({
      query: ({ propertyId, accountReferenceCode }) => `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}`,
      providesTags: ["Staff"],
    }),
    openSalaryMonth: builder.mutation<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string }>({
      query: ({ propertyId, accountReferenceCode }) => ({ method: "POST", url: `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}/months` }),
      invalidatesTags: ["Staff"],
    }),
    addSalaryAdjustment: builder.mutation<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string; payrollMonth: string; payload: { adjustmentType: SalaryAdjustmentType; amountPaise: number; reason: string } }>({
      query: ({ propertyId, accountReferenceCode, payrollMonth, payload }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}/months/${payrollMonth}/adjustments` }),
      invalidatesTags: ["Staff"],
    }),
    updateSalaryAdjustment: builder.mutation<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string; payrollMonth: string; adjustmentId: string; payload: { adjustmentType: SalaryAdjustmentType; amountPaise: number; reason: string } }>({
      query: ({ propertyId, accountReferenceCode, payrollMonth, adjustmentId, payload }) => ({ body: payload, method: "PATCH", url: `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}/months/${payrollMonth}/adjustments/${adjustmentId}` }),
      invalidatesTags: ["Staff"],
    }),
    removeSalaryAdjustment: builder.mutation<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string; payrollMonth: string; adjustmentId: string }>({
      query: ({ propertyId, accountReferenceCode, payrollMonth, adjustmentId }) => ({ method: "DELETE", url: `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}/months/${payrollMonth}/adjustments/${adjustmentId}` }),
      invalidatesTags: ["Staff"],
    }),
    recordSalaryPayment: builder.mutation<SalaryAccountDetail, { propertyId: string; accountReferenceCode: string; payrollMonth: string; payload: { amountPaise: number; paidOn: string; paymentMethod: SalaryPaymentMethod; referenceText?: string; notes?: string } }>({
      query: ({ propertyId, accountReferenceCode, payrollMonth, payload }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/staff/salary-accounts/${accountReferenceCode}/months/${payrollMonth}/payments` }),
      invalidatesTags: ["Staff"],
    }),

    // Manager self-service (read-only).
    getMyManagerEmployment: builder.query<ManagerEmployment, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/my-employment`,
      providesTags: ["Staff"],
    }),
    getMySalaryAccount: builder.query<SalaryAccountDetail, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/my-salary-account`,
      providesTags: ["Staff"],
    }),
    listStaffDirectory: builder.query<StaffMemberSummary[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/staff/directory`,
      providesTags: ["Staff"],
    }),
  }),
});

export const {
  useAddSalaryAdjustmentMutation,
  useCreateStaffCategoryMutation,
  useCreateStaffMemberMutation,
  useDeactivateStaffCategoryMutation,
  useEndManagerEmploymentMutation,
  useEndStaffMemberMutation,
  useGetMyManagerEmploymentQuery,
  useGetMySalaryAccountQuery,
  useGetSalaryAccountQuery,
  useLazyGetSalaryAccountQuery,
  useListEmployeeHistoryQuery,
  useListManagerEmploymentQuery,
  useListSalaryAccountsQuery,
  useListStaffCategoriesQuery,
  useListStaffDirectoryQuery,
  useListStaffMembersQuery,
  useManagerTerminationPreviewQuery,
  useStaffTerminationPreviewQuery,
  useOpenManagerSalaryAccountMutation,
  useOpenSalaryMonthMutation,
  useOpenStaffSalaryAccountMutation,
  useRecordSalaryPaymentMutation,
  useRemoveSalaryAdjustmentMutation,
  useUpdateManagerEmploymentMutation,
  useUpdateSalaryAdjustmentMutation,
  useUpdateStaffCategoryMutation,
  useUpdateStaffMemberMutation,
} = staffApi;
