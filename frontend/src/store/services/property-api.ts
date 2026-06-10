import { api } from "@/store/api";

export type PropertyType = "PG" | "HOSTEL" | "APARTMENT" | "SOCIETY";
export type RoomType = "SINGLE" | "DOUBLE" | "TRIPLE" | "FOUR_SHARING" | "FIVE_SHARING" | "DORMITORY";
export type RoomStatus = "VACANT" | "PARTIALLY_OCCUPIED" | "OCCUPIED" | "MAINTENANCE";
export type RoomConditioning = "AC" | "NON_AC";
export type BillingCollectionTiming = "CYCLE_START" | "CYCLE_END";

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

export type OwnerProperty = {
  id: string;
  referenceCode: string;
  ownerId: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  type: PropertyType;
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
  city: string;
  state?: string | null;
  pincode: string;
  type: PropertyType;
  facilities: PropertyFacility[];
  customFacilities: string[];
  dailyGuestAcRatePaise?: number | null;
  dailyGuestNonAcRatePaise?: number | null;
  rentLateFeePerDayPaise?: number | null;
  rentGraceDays: number;
  standardDepositPaise: number;
  noticePeriodDays: number;
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

    updateProperty: builder.mutation<OwnerProperty, { propertyId: string; payload: UpdatePropertyPayload }>({
      query: ({ payload, propertyId }) => ({ body: payload, method: "PATCH", url: `/api/v1/properties/${propertyId}` }),
      invalidatesTags: ["Property"],
    }),

    listPropertyRooms: builder.query<OwnerRoom[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/rooms`,
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

    markRoomStatus: builder.mutation<OwnerRoom, { propertyId: string; roomId: string; status: RoomStatus }>({
      query: ({ propertyId, roomId, status }) => ({
        method: "PATCH",
        params: { status },
        url: `/api/v1/properties/${propertyId}/rooms/${roomId}/status`,
      }),
      invalidatesTags: ["Property", "Tenancy"],
    }),

    deactivateRoom: builder.mutation<void, { propertyId: string; roomId: string }>({
      query: ({ propertyId, roomId }) => ({ method: "DELETE", url: `/api/v1/properties/${propertyId}/rooms/${roomId}` }),
      invalidatesTags: ["Property", "Tenancy"],
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
      invalidatesTags: ["Property", "Notification"],
    }),

    removePropertyManager: builder.mutation<void, { propertyId: string; managerUserId: string }>({
      query: ({ managerUserId, propertyId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/managers/${managerUserId}`,
      }),
      invalidatesTags: ["Property"],
    }),

    shiftPropertyManager: builder.mutation<PropertyManager, { propertyId: string; managerUserId: string; targetPropertyId: string }>({
      query: ({ managerUserId, propertyId, targetPropertyId }) => ({
        body: { targetPropertyId },
        method: "POST",
        url: `/api/v1/properties/${propertyId}/managers/${managerUserId}/shift`,
      }),
      invalidatesTags: ["Property", "Notification"],
    }),
  }),
});

export const {
  useAddPropertyManagerMutation,
  useCreateRoomMutation,
  useCreateRoomsBulkMutation,
  useDeactivateRoomMutation,
  useGetPropertyQuery,
  useListMyPropertiesQuery,
  useLazyLookupManagerQuery,
  useListPropertyManagersQuery,
  useListPropertyRoomsQuery,
  useMarkRoomStatusMutation,
  useRemovePropertyManagerMutation,
  useShiftPropertyManagerMutation,
  useUpdatePropertyMutation,
  useUpdateRoomMutation,
} = propertyApi;
