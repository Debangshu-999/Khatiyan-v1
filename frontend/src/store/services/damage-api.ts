import { api, ifMatch } from "@/store/api";
import type { Page } from "@/store/pagination";
import type { BillingCycle } from "@/store/services/billing-api";
import type { DamageLevel } from "@/store/services/property-api";

/**
 * Damage records (2026-10-29): a damage to one item in one room, who answers
 * for it, the level it brought the item to and what it costs. Charged once on
 * a one-off bill per share, or left for exit. Repaired or replaced, it moves
 * to the Repairs history. Each room's item condition comes with it.
 */

export type DamageResponsibility = "TENANT" | "SPLIT" | "NONE";
export type DamageRecordSource = "MANUAL" | "MOVE_IN";
export type DamageRecordStatus = "OPEN" | "REPAIRED" | "REPLACED";

export type DamageRecordShare = {
  tenancyId: string;
  tenantName: string;
  amountPaise: number;
  billId: string | null;
  billCode: string | null;
  billStatus: string | null;
  /** Waived at checkout, for good. */
  waived: boolean;
  /** What came off the deposit, at checkout or through its Damage bill. */
  depositPaise: number;
};

export type DamageRecord = {
  id: string;
  code: string;
  roomId: string;
  roomLabel: string | null;
  itemName: string;
  section: "ROOM" | "BATHROOM";
  /** Null when recorded with the property's damage levels off (2026-11-07). */
  damageLevel: DamageLevel | null;
  costPaise: number;
  note: string | null;
  photoUrls: string[];
  responsibility: DamageResponsibility;
  source: DamageRecordSource;
  status: DamageRecordStatus;
  createdAt: string;
  createdByUserId: string;
  createdByName: string | null;
  shares: DamageRecordShare[];
  /** Every share is resolved: a live bill, the deposit or a waiver. */
  charged: boolean;
  /** A bill from it is paid or awaiting confirmation, or a share was waived or took deposit money: it can no longer change. */
  locked: boolean;
  /** Which split of the damage this is: a split is one record per tenant. Null when it was not split. */
  splitNumber: number | null;
  repairedLevel: DamageLevel | null;
  repairPhotoUrls: string[] | null;
  repairNote: string | null;
  repairedAt: string | null;
  repairedByUserId: string | null;
  repairedByName: string | null;
  version: number;
};

export type DamageRecordPage = {
  records: Page<DamageRecord>;
  openCount: number;
  historyCount: number;
  notChargedCount: number;
};

export type SaveDamageRecordPayload = {
  roomId: string;
  itemName: string;
  section: "ROOM" | "BATHROOM";
  /** Null when recorded with the property's damage levels off (2026-11-07). */
  damageLevel: DamageLevel | null;
  costPaise: number;
  note: string | null;
  photoUrls: string[];
  responsibility: DamageResponsibility;
  /** The one tenant for TENANT, null for SPLIT. */
  tenancyId: string | null;
  /** Bills every record this makes in the same step, so a split is billed whole or not at all. */
  chargeNow?: boolean;
};

export type RepairDamagePayload = {
  /** The level it is back to. Ignored for a replacement, which is always NA. */
  level: DamageLevel | null;
  photoUrls: string[];
  note: string | null;
};

export type RoomItemCondition = {
  itemName: string;
  section: "ROOM" | "BATHROOM";
  level: DamageLevel;
  photoUrls: string[];
  updatedAt: string;
};

const base = (propertyId: string) => `/api/v1/billing/properties/${propertyId}/damage-records`;

export const damageApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDamageRecordPages: builder.infiniteQuery<DamageRecordPage, { propertyId: string; history: boolean; search?: string; level?: DamageLevel | null }, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.records.hasNext ? lastPage.records.page + 1 : undefined,
      },
      // A search on the code or item, and one level, done by the server (user, 2026-11-14).
      query: ({ queryArg: { propertyId, history, search, level }, pageParam }) =>
        `${base(propertyId)}/page?history=${history}&page=${pageParam}&size=10`
        + (search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : "")
        + (level ? `&level=${level}` : ""),
      providesTags: ["DamageRecords"],
    }),

    getDamageRecords: builder.query<DamageRecord[], { propertyId: string; history: boolean }>({
      query: ({ propertyId, history }) => `${base(propertyId)}?history=${history}`,
      providesTags: ["DamageRecords"],
    }),

    getTenancyDamageRecords: builder.query<DamageRecord[], string>({
      query: (tenancyId) => `/api/v1/billing/tenancies/${tenancyId}/damage-records`,
      providesTags: ["DamageRecords"],
    }),

    getRoomItemConditions: builder.query<RoomItemCondition[], { propertyId: string; roomId: string }>({
      query: ({ propertyId, roomId }) => `/api/v1/properties/${propertyId}/rooms/${roomId}/item-conditions`,
      providesTags: ["DamageRecords"],
    }),

    createDamageRecord: builder.mutation<DamageRecord, { propertyId: string; payload: SaveDamageRecordPayload }>({
      query: ({ propertyId, payload }) => ({ body: payload, method: "POST", url: base(propertyId) }),
      invalidatesTags: ["DamageRecords"],
    }),

    updateDamageRecord: builder.mutation<
      DamageRecord,
      { propertyId: string; recordId: string; payload: SaveDamageRecordPayload; version: number }
    >({
      query: ({ propertyId, recordId, payload, version }) => ({
        body: payload,
        headers: ifMatch(version),
        method: "PATCH",
        url: `${base(propertyId)}/${recordId}`,
      }),
      // A changed amount cancels its unpaid bills.
      invalidatesTags: ["DamageRecords", "BillingCycle"],
    }),

    deleteDamageRecord: builder.mutation<void, { propertyId: string; recordId: string; version: number }>({
      query: ({ propertyId, recordId, version }) => ({
        headers: ifMatch(version),
        method: "DELETE",
        url: `${base(propertyId)}/${recordId}`,
      }),
      invalidatesTags: ["DamageRecords", "BillingCycle"],
    }),

    chargeDamageRecord: builder.mutation<DamageRecord, { propertyId: string; recordId: string; version: number }>({
      query: ({ propertyId, recordId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `${base(propertyId)}/${recordId}/charge`,
      }),
      invalidatesTags: ["DamageRecords", "BillingCycle"],
    }),

    // Damage bills at checkout (2026-10-31): raised straight away, and they block the exit until cleared.
    raiseDamageBill: builder.mutation<BillingCycle, { tenancyId: string; recordIds: string[]; fromDepositPaise: number | null }>({
      query: ({ tenancyId, recordIds, fromDepositPaise }) => ({
        body: { fromDepositPaise, recordIds },
        method: "POST",
        url: `/api/v1/billing/tenancies/${tenancyId}/damage-bill`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => ["DamageRecords", "BillingCycle", { type: "Deposit", id: tenancyId }],
    }),

    chargeDamageBillFromDeposit: builder.mutation<BillingCycle, { billId: string; tenancyId: string; version: number }>({
      query: ({ billId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/bills/${billId}/charge-from-deposit`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => ["DamageRecords", "BillingCycle", { type: "Deposit", id: tenancyId }],
    }),

    cancelDamageBillToChange: builder.mutation<BillingCycle, { billId: string; tenancyId: string; version: number }>({
      query: ({ billId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/bills/${billId}/cancel-to-change`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => ["DamageRecords", "BillingCycle", "Notification", { type: "Deposit", id: tenancyId }],
    }),

    moveDamageBillOffDeposit: builder.mutation<BillingCycle, { billId: string; tenancyId: string; version: number }>({
      query: ({ billId, version }) => ({
        headers: ifMatch(version),
        method: "POST",
        url: `/api/v1/billing/bills/${billId}/move-off-deposit`,
      }),
      invalidatesTags: (_result, _error, { tenancyId }) => ["DamageRecords", "BillingCycle", { type: "Deposit", id: tenancyId }],
    }),

    repairDamageRecord: builder.mutation<
      DamageRecord,
      { propertyId: string; recordId: string; payload: RepairDamagePayload; version: number }
    >({
      query: ({ propertyId, recordId, payload, version }) => ({
        body: payload,
        headers: ifMatch(version),
        method: "POST",
        url: `${base(propertyId)}/${recordId}/repair`,
      }),
      invalidatesTags: ["DamageRecords"],
    }),

    replaceDamageRecord: builder.mutation<
      DamageRecord,
      { propertyId: string; recordId: string; payload: RepairDamagePayload; version: number }
    >({
      query: ({ propertyId, recordId, payload, version }) => ({
        body: payload,
        headers: ifMatch(version),
        method: "POST",
        url: `${base(propertyId)}/${recordId}/replace`,
      }),
      invalidatesTags: ["DamageRecords"],
    }),
  }),
});

export const {
  useGetDamageRecordPagesInfiniteQuery,
  useCancelDamageBillToChangeMutation,
  useChargeDamageBillFromDepositMutation,
  useChargeDamageRecordMutation,
  useCreateDamageRecordMutation,
  useDeleteDamageRecordMutation,
  useGetDamageRecordsQuery,
  useGetRoomItemConditionsQuery,
  useGetTenancyDamageRecordsQuery,
  useMoveDamageBillOffDepositMutation,
  useRaiseDamageBillMutation,
  useRepairDamageRecordMutation,
  useReplaceDamageRecordMutation,
  useUpdateDamageRecordMutation,
} = damageApi;
