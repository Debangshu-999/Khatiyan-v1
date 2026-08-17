import { api } from "@/store/api";

export type PropertyType = "PG" | "HOSTEL" | "APARTMENT" | "SOCIETY";
export type RoomType = "SINGLE" | "DOUBLE" | "TRIPLE" | "FOUR_SHARING" | "FIVE_SHARING" | "DORMITORY";
export type RoomStatus = "VACANT" | "PARTIALLY_OCCUPIED" | "OCCUPIED" | "MAINTENANCE";
export type RoomConditioning = "AC" | "NON_AC";
export type BillingCollectionTiming = "CYCLE_START" | "CYCLE_END";
export type PgFor = "MALE" | "FEMALE" | "ANYONE";
export type PreferredTenantType = "STUDENT" | "PROFESSIONAL" | "ANYONE";
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER";
export type BathroomType = "ATTACHED" | "COMMON";

export type PropertyFacility =
  | "WIFI"
  | "WASHING_MACHINE"
  | "MESS"
  | "ROOM_CLEANING"
  | "GYM"
  | "PARKING"
  | "POWER_BACKUP"
  | "CCTV"
  | "SECURITY"
  | "DRINKING_WATER"
  | "HOT_WATER"
  | "COMMON_KITCHEN"
  | "REFRIGERATOR"
  | "STUDY_AREA"
  | "LIFT"
  | "AIR_CONDITIONING"
  | "HOUSEKEEPING"
  | "LAUNDRY_SERVICE";

export const PROPERTY_FACILITIES: PropertyFacility[] = [
  "WIFI",
  "WASHING_MACHINE",
  "MESS",
  "ROOM_CLEANING",
  "GYM",
  "PARKING",
  "POWER_BACKUP",
  "CCTV",
  "SECURITY",
  "DRINKING_WATER",
  "HOT_WATER",
  "COMMON_KITCHEN",
  "REFRIGERATOR",
  "STUDY_AREA",
  "LIFT",
  "AIR_CONDITIONING",
  "HOUSEKEEPING",
  "LAUNDRY_SERVICE",
];

export const ROOM_TYPES: RoomType[] = ["SINGLE", "DOUBLE", "TRIPLE", "FOUR_SHARING", "FIVE_SHARING", "DORMITORY"];
export const ROOM_CONDITIONINGS: RoomConditioning[] = ["AC", "NON_AC"];
export const PROPERTY_TYPES: PropertyType[] = ["PG", "HOSTEL", "APARTMENT", "SOCIETY"];
export const PG_FOR_OPTIONS: PgFor[] = ["ANYONE", "MALE", "FEMALE"];
export const PREFERRED_TENANT_OPTIONS: PreferredTenantType[] = ["ANYONE", "STUDENT", "PROFESSIONAL"];
export const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];
export const BATHROOM_TYPES: BathroomType[] = ["ATTACHED", "COMMON"];

/**
 * How much notice a tenant must give before leaving.
 *
 * An enum rather than a day count: one month from 15 Jan is 15 Feb, but *30
 * days* from 15 Jan is 14 Feb, and a billing cycle is a calendar month anchored
 * on the tenant's move-in day. The day-count answer lands a day off the cycle
 * boundary, which is why the server stopped storing one.
 */
export type NoticePeriod =
  | "FIVE_DAYS"
  | "FIFTEEN_DAYS"
  | "ONE_MONTH"
  | "TWO_MONTHS"
  | "THREE_MONTHS";

export const NOTICE_PERIOD_OPTIONS: NoticePeriod[] = [
  "FIVE_DAYS",
  "FIFTEEN_DAYS",
  "ONE_MONTH",
  "TWO_MONTHS",
  "THREE_MONTHS",
];

export const NOTICE_PERIOD_LABELS: Record<NoticePeriod, string> = {
  FIVE_DAYS: "5 days",
  FIFTEEN_DAYS: "15 days",
  ONE_MONTH: "1 month",
  TWO_MONTHS: "2 months",
  THREE_MONTHS: "3 months",
};

/** Shown under the picker so an owner knows the bounds without trial and error. */
export const NOTICE_PERIOD_RANGE_HINT = "Min 5 days, max 3 months.";

/**
 * Rent grace ceiling, mirroring Property.MAX_RENT_GRACE_DAYS on the server.
 *
 * Was 30, which let the payment window span an entire cycle — the same window an
 * exit request may be raised in.
 */
export const MIN_RENT_GRACE_DAYS = 0;
export const MAX_RENT_GRACE_DAYS = 10;
export const RENT_GRACE_RANGE_HINT = `Min ${MIN_RENT_GRACE_DAYS}, max ${MAX_RENT_GRACE_DAYS} days.`;

export type OwnerProperty = {
  id: string;
  referenceCode: string;
  ownerId: string;
  name: string;
  address: string;
  area: string;
  city: string;
  state: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  type: PropertyType;
  pgFor: PgFor;
  preferredFor: PreferredTenantType;
  foodIncluded: boolean;
  includedMeals: MealType[];
  electricityIncluded: boolean;
  bathroomType: BathroomType;
  availableSharingTypes: RoomType[];
  facilities: PropertyFacility[];
  customFacilities: string[];
  dailyGuestAcRatePaise: number | null;
  dailyGuestNonAcRatePaise: number | null;
  rentLateFeePerDayPaise: number | null;
  billingCollectionTiming: BillingCollectionTiming;
  rentGraceDays: number;
  standardDepositPaise: number;
  noticePeriod: NoticePeriod;
  /**
   * Derived, and ZERO for the whole-month options — they are counted in billing
   * cycles, not days. Render `noticePeriod` via NOTICE_PERIOD_LABELS instead;
   * this exists only for the sub-month options that genuinely mean days.
   */
  noticePeriodDays: number;
  discoveryProfileCreated: boolean;
  active: boolean;
};

export type OwnerRoom = {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: string | null;
  capacity: number;
  occupiedCount: number;
  availableVacancies: number;
  roomType: RoomType;
  conditioning: RoomConditioning;
  baseRentPaise: number;
  status: RoomStatus;
  active: boolean;
  maintenanceReason: string | null;
  maintenanceUntil: string | null;
  maintenanceMarkedByUserId: string | null;
  maintenanceMarkedByName: string | null;
  maintenanceMarkedAt: string | null;
  updatedAt: string | null;
};

export type PropertyManager = {
  id: string;
  propertyId: string;
  managerUserId: string;
  managerPhone: string;
  managerFullName: string;
  managerProfilePhotoUrl: string | null;
  assignedByUserId: string;
  active: boolean;
  phoneVerified: boolean;
  profileCompleted: boolean;
  accountActive: boolean;
  createdAt: string;
};

export type UpdatePropertyPayload = {
  name: string;
  address: string;
  area: string;
  city: string;
  state?: string | null;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  type: PropertyType;
  pgFor?: PgFor | null;
  preferredFor?: PreferredTenantType | null;
  foodIncluded?: boolean | null;
  includedMeals?: MealType[];
  electricityIncluded?: boolean | null;
  bathroomType?: BathroomType | null;
  availableSharingTypes?: RoomType[];
  facilities: PropertyFacility[];
  customFacilities: string[];
  dailyGuestAcRatePaise?: number | null;
  dailyGuestNonAcRatePaise?: number | null;
  rentLateFeePerDayPaise?: number | null;
  rentGraceDays: number;
  standardDepositPaise: number;
  /** Null leaves it to the server's default of one month. */
  noticePeriod: NoticePeriod | null;
};

export type CreatePropertyPayload = UpdatePropertyPayload & {
  discoveryDescription?: string | null;
  discoveryHeadline?: string | null;
  discoveryProfileImageUrl?: string | null;
  /**
   * The listing gallery, cover first. Uploaded before this call, so a failed
   * upload aborts registration rather than leaving a property with no pictures.
   */
  discoveryImages?: { url: string; publicId: string | null }[];
};

export type CreateRoomPayload = {
  roomNumber: string;
  floor: string;
  capacity: number;
  roomType: RoomType;
  conditioning: RoomConditioning;
  baseRentPaise: number;
};

export type CreateRoomRangePayload = {
  prefix: string;
  startNumber: number;
  endNumber: number;
  floor: string;
  capacity: number;
  roomType: RoomType;
  conditioning: RoomConditioning;
  baseRentPaise: number;
};

export type CreateRoomBulkPayload = {
  rooms?: CreateRoomPayload[];
  ranges?: CreateRoomRangePayload[];
};

export type AddManagerPayload = {
  phone: string;
  fullName: string;
  dateOfBirth?: string | null;
  salaryStructure: "DAILY" | "MONTHLY";
  salaryRatePaise: number;
  benefitsSummary?: string;
  employmentStartDate: string;
  employmentEndDate?: string | null;
  employmentNotes?: string;
};

export type ManagerLookup = {
  exists: boolean;
  fullName: string | null;
  alreadyAssigned: boolean;
  eligible: boolean;
  message: string;
};

// Property exit policies: the damage-charge schedule and the move-out checklist.
// Property-owned so every monthly tenancy (agreement or not) reads the same
// rates and checklist at deposit settlement.
export type PropertyDamageCharge = { name: string; chargePaise: number };

export type PropertyExitPolicy = {
  damageCharges: PropertyDamageCharge[];
  exitChecklist: string[];
  /**
   * What leaving before serving notice costs, in the owner's words. Null when
   * none is written. Only reaches an agreement on an INDEFINITE term — a fixed
   * term prices early departure through its own validity rule instead.
   */
  prematureExitPolicy: string | null;
};


// ---- Manager permissions ----

// Mirrors the backend ManagerResource enum. Only the resources whose module has
// had its checks converted are actually enforced — see MANAGEABLE_RESOURCES in
// app/owner-manager-permissions.tsx, which is the list the owner can edit.
export type ManagerResource =
  | "TENANCIES"
  | "TENANCY_CREATE"
  | "TENANCY_RULES"
  | "EXIT_REQUESTS"
  | "ROOM_CHANGES"
  | "BILLING_CYCLES"
  | "DEPOSITS"
  | "EXPENSES"
  | "PNL"
  | "ROOMS"
  | "PROPERTY_SETTINGS"
  | "PROPERTY_BOARD"
  | "NEARBY_PLACES"
  | "NOTICES"
  | "CONCERNS"
  | "VACANCY_FINDER";

export type ManagerAccessLevel = "NONE" | "VIEW" | "MANAGE";

export type ManagerPermissions = {
  propertyId: string;
  managerUserId: string;
  // True for the property owner, whose access is total and not grantable.
  owner: boolean;
  // Always complete — every resource is present, NONE included.
  levels: Record<ManagerResource, ManagerAccessLevel>;
};

export const propertyApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listMyProperties: builder.query<OwnerProperty[], void>({
      query: () => "/api/v1/properties",
      providesTags: ["Property"],
    }),

    getProperty: builder.query<OwnerProperty, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}`,
      providesTags: ["Property"],
    }),

    createProperty: builder.mutation<OwnerProperty, CreatePropertyPayload>({
      query: (payload) => ({ body: payload, method: "POST", url: "/api/v1/properties" }),
      invalidatesTags: ["Property", "Notification"],
    }),

    updateProperty: builder.mutation<OwnerProperty, { propertyId: string; payload: UpdatePropertyPayload }>({
      query: ({ payload, propertyId }) => ({ body: payload, method: "PATCH", url: `/api/v1/properties/${propertyId}` }),
      invalidatesTags: ["Property"],
    }),

    listPropertyRooms: builder.query<OwnerRoom[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/rooms`,
      providesTags: ["Property"],
    }),

    // Owner rooms screen needs deactivated rooms too (for the deactivated
    // filter) plus the resolved maintenance marker name, so it asks for the
    // inactive-inclusive listing rather than the active-only one above.
    listAllPropertyRooms: builder.query<OwnerRoom[], string>({
      query: (propertyId) => ({
        params: { includeInactive: true },
        url: `/api/v1/properties/${propertyId}/rooms`,
      }),
      providesTags: ["Property"],
    }),

    createRoom: builder.mutation<OwnerRoom, { propertyId: string; payload: CreateRoomPayload }>({
      query: ({ payload, propertyId }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/rooms` }),
      invalidatesTags: ["Property", "Tenancy"],
    }),

    createRoomsBulk: builder.mutation<OwnerRoom[], { propertyId: string; payload: CreateRoomBulkPayload }>({
      query: ({ payload, propertyId }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/rooms/bulk` }),
      invalidatesTags: ["Property", "Tenancy"],
    }),

    updateRoom: builder.mutation<OwnerRoom, { propertyId: string; roomId: string; payload: CreateRoomPayload }>({
      query: ({ payload, propertyId, roomId }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/rooms/${roomId}`,
      }),
      invalidatesTags: ["Property", "Tenancy"],
    }),

    markRoomStatus: builder.mutation<
      OwnerRoom,
      { propertyId: string; roomId: string; status: RoomStatus; reason?: string; until?: string | null }
    >({
      query: ({ propertyId, reason, roomId, status, until }) => ({
        body: { reason: reason ?? null, status, until: until ?? null },
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/rooms/${roomId}/status`,
      }),
      invalidatesTags: ["Property", "Tenancy", "Notification"],
    }),

    updateRoomMaintenance: builder.mutation<
      OwnerRoom,
      { propertyId: string; roomId: string; reason: string; until?: string | null }
    >({
      query: ({ propertyId, reason, roomId, until }) => ({
        body: { reason, until: until ?? null },
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/rooms/${roomId}/maintenance`,
      }),
      invalidatesTags: ["Property"],
    }),

    reactivateRoom: builder.mutation<OwnerRoom, { propertyId: string; roomId: string }>({
      query: ({ propertyId, roomId }) => ({
        method: "POST",
        url: `/api/v1/properties/${propertyId}/rooms/${roomId}/reactivate`,
      }),
      invalidatesTags: ["Property", "Tenancy", "Notification"],
    }),

    deactivateRoom: builder.mutation<void, { propertyId: string; roomId: string }>({
      query: ({ propertyId, roomId }) => ({ method: "DELETE", url: `/api/v1/properties/${propertyId}/rooms/${roomId}` }),
      invalidatesTags: ["Property", "Tenancy", "Notification"],
    }),

    /** What the CALLER may do here. Drives which sections the app renders. */
    getMyPropertyPermissions: builder.query<ManagerPermissions, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/my-permissions`,
      providesTags: ["Property"],
    }),

    getManagerPermissions: builder.query<ManagerPermissions, { propertyId: string; managerUserId: string }>({
      query: ({ managerUserId, propertyId }) =>
        `/api/v1/properties/${propertyId}/managers/${managerUserId}/permissions`,
      providesTags: ["Property"],
    }),

    /** Full replacement — anything omitted is revoked. */
    replaceManagerPermissions: builder.mutation<
      ManagerPermissions,
      { propertyId: string; managerUserId: string; levels: Record<ManagerResource, ManagerAccessLevel> }
    >({
      query: ({ levels, managerUserId, propertyId }) => ({
        body: { levels },
        method: "PUT",
        url: `/api/v1/properties/${propertyId}/managers/${managerUserId}/permissions`,
      }),
      invalidatesTags: ["Property", "Staff"],
    }),

    listPropertyManagers: builder.query<PropertyManager[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/managers`,
      providesTags: ["Property"],
    }),

    lookupManager: builder.query<ManagerLookup, { propertyId: string; phone: string }>({
      query: ({ phone, propertyId }) => ({ params: { phone }, url: `/api/v1/properties/${propertyId}/managers/lookup` }),
    }),

    addPropertyManager: builder.mutation<PropertyManager, { propertyId: string; payload: AddManagerPayload }>({
      query: ({ payload, propertyId }) => ({ body: payload, method: "POST", url: `/api/v1/properties/${propertyId}/managers` }),
      invalidatesTags: ["Property", "Notification", "Staff"],
    }),

    removePropertyManager: builder.mutation<void, { propertyId: string; managerUserId: string }>({
      query: ({ managerUserId, propertyId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/managers/${managerUserId}`,
      }),
      invalidatesTags: ["Property", "Staff"],
    }),

    shiftPropertyManager: builder.mutation<PropertyManager, { propertyId: string; managerUserId: string; targetPropertyId: string }>({
      query: ({ managerUserId, propertyId, targetPropertyId }) => ({
        body: { targetPropertyId },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/managers/${managerUserId}/shift`,
      }),
      invalidatesTags: ["Property", "Notification", "Staff"],
    }),

    getPropertyExitPolicies: builder.query<PropertyExitPolicy, string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/exit-policies`,
      providesTags: ["Property"],
    }),

    updatePropertyExitPolicies: builder.mutation<PropertyExitPolicy, { propertyId: string; payload: PropertyExitPolicy }>({
      query: ({ payload, propertyId }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/exit-policies`,
      }),
      invalidatesTags: ["Property", "Compliance"],
    }),
  }),
});

export const {
  useAddPropertyManagerMutation,
  useCreatePropertyMutation,
  useCreateRoomMutation,
  useCreateRoomsBulkMutation,
  useDeactivateRoomMutation,
  useGetPropertyExitPoliciesQuery,
  useGetPropertyQuery,
  useListMyPropertiesQuery,
  useUpdatePropertyExitPoliciesMutation,
  useLazyLookupManagerQuery,
  useListAllPropertyRoomsQuery,
  useGetManagerPermissionsQuery,
  useGetMyPropertyPermissionsQuery,
  useListPropertyManagersQuery,
  useReplaceManagerPermissionsMutation,
  useListPropertyRoomsQuery,
  useMarkRoomStatusMutation,
  useReactivateRoomMutation,
  useRemovePropertyManagerMutation,
  useShiftPropertyManagerMutation,
  useUpdatePropertyMutation,
  useUpdateRoomMaintenanceMutation,
  useUpdateRoomMutation,
} = propertyApi;
