import { api } from "@/store/api";

export type BoardCategory = {
  id: string;
  propertyId: string;
  createdByUserId: string;
  name: string;
  slug: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BoardItem = {
  id: string;
  propertyId: string;
  createdByUserId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  body: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateBoardCategoryPayload = {
  name: string;
  slug?: string | null;
  displayOrder?: number | null;
};

export type CreateBoardItemPayload = {
  categoryId: string;
  title: string;
  body: string;
  displayOrder?: number | null;
};

export const propertyBoardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listBoardCategories: builder.query<BoardCategory[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/property-board/categories`,
      providesTags: ["Notice"],
    }),

    listBoardItems: builder.query<BoardItem[], string>({
      query: (propertyId) => `/api/v1/properties/${propertyId}/property-board/items`,
      providesTags: ["Notice"],
    }),

    createBoardCategory: builder.mutation<BoardCategory, { propertyId: string; payload: CreateBoardCategoryPayload }>({
      query: ({ payload, propertyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/property-board/categories`,
      }),
      invalidatesTags: ["Notice"],
    }),

    updateBoardCategory: builder.mutation<BoardCategory, { propertyId: string; categoryId: string; payload: CreateBoardCategoryPayload }>({
      query: ({ categoryId, payload, propertyId }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/property-board/categories/${categoryId}`,
      }),
      invalidatesTags: ["Notice"],
    }),

    deactivateBoardCategory: builder.mutation<void, { propertyId: string; categoryId: string }>({
      query: ({ categoryId, propertyId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/property-board/categories/${categoryId}`,
      }),
      invalidatesTags: ["Notice"],
    }),

    createBoardItem: builder.mutation<BoardItem, { propertyId: string; payload: CreateBoardItemPayload }>({
      query: ({ payload, propertyId }) => ({
        body: payload,
        method: "POST",
        url: `/api/v1/properties/${propertyId}/property-board/items`,
      }),
      invalidatesTags: ["Notice"],
    }),

    updateBoardItem: builder.mutation<BoardItem, { propertyId: string; itemId: string; payload: CreateBoardItemPayload }>({
      query: ({ itemId, payload, propertyId }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/v1/properties/${propertyId}/property-board/items/${itemId}`,
      }),
      invalidatesTags: ["Notice"],
    }),

    deactivateBoardItem: builder.mutation<void, { propertyId: string; itemId: string }>({
      query: ({ itemId, propertyId }) => ({
        method: "DELETE",
        url: `/api/v1/properties/${propertyId}/property-board/items/${itemId}`,
      }),
      invalidatesTags: ["Notice"],
    }),
  }),
  // Fast Refresh re-runs this whole module on every edit, so injectEndpoints
  // sees endpoints it already registered and logs an error for each one — two
  // dozen of them behind a red overlay, none of them real. Allowed in dev for
  // that reason; "throw" in production, where the module runs once and a second
  // registration really would be a duplicate name.
  overrideExisting: __DEV__ ? true : "throw",
});

export const {
  useCreateBoardCategoryMutation,
  useCreateBoardItemMutation,
  useDeactivateBoardCategoryMutation,
  useDeactivateBoardItemMutation,
  useListBoardCategoriesQuery,
  useListBoardItemsQuery,
  useUpdateBoardCategoryMutation,
  useUpdateBoardItemMutation,
} = propertyBoardApi;
