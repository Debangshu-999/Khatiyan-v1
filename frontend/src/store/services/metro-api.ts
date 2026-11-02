import { api } from "@/store/api";

export type MetroStation = {
  code: string;
  name: string;
  /** The other lines through this station. Empty unless it is an interchange. */
  otherLineColours: string[];
};

export type MetroLine = {
  code: string;
  name: string;
  colour: string;
  fromStation: string;
  toStation: string;
  stations: MetroStation[];
};

/** One city's station tree: its lines, each with its stations in order. */
export type MetroSystem = {
  code: string;
  name: string;
  centreLatitude: number;
  centreLongitude: number;
  lines: MetroLine[];
};

export const metroApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMetroSystems: builder.query<MetroSystem[], void>({
      query: () => ({ url: "/api/v1/discovery/metro" }),
      // Changes only with a release, so one read lasts the session.
      keepUnusedDataFor: 3600,
    }),
  }),
});

export const { useGetMetroSystemsQuery } = metroApi;
