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
  noticePeriodDays: number;
};

export type CreatePropertyPayload = UpdatePropertyPayload & {
  discoveryDescription?: string | null;
  discoveryHeadline?: string | null;
  discoveryProfileImageUrl?: string | null;
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
  }),
});

export const {
  useAddPropertyManagerMutation,
  useCreatePropertyMutation,
  useCreateRoomMutation,
  useCreateRoomsBulkMutation,
  useDeactivateRoomMutation,
  useGetPropertyQuery,
  useListMyPropertiesQuery,
  useLazyLookupManagerQuery,
  useListAllPropertyRoomsQuery,
  useListPropertyManagersQuery,
  useListPropertyRoomsQuery,
  useMarkRoomStatusMutation,
  useReactivateRoomMutation,
  useRemovePropertyManagerMutation,
  useShiftPropertyManagerMutation,
  useUpdatePropertyMutation,
  useUpdateRoomMaintenanceMutation,
  useUpdateRoomMutation,
} = propertyApi;
