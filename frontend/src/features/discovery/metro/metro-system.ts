import type { MetroLine, MetroStation, MetroSystem } from "@/store/services/metro-api";

/** How near a city's centre the device has to be to count as being in it. */
const SYSTEM_REACH_KM = 75;
export const MAX_TICKED_STATIONS = 60;

export type MetroCity = {
  code: string;
  latitude: number;
  longitude: number;
  name: string;
};

export type DevicePoint = {
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function distanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRad = Math.PI / 180;
  const halfLat = ((toLat - fromLat) * toRad) / 2;
  const halfLng = ((toLng - fromLng) * toRad) / 2;
  const h =
    Math.sin(halfLat) * Math.sin(halfLat) +
    Math.cos(fromLat * toRad) * Math.cos(toLat * toRad) * Math.sin(halfLng) * Math.sin(halfLng);
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Indian cities with a metro. Only those with a seeded system have lines, and
 * the rest show the under-construction screen until their file is reviewed.
 */
export const METRO_CITIES: MetroCity[] = [
  { code: "kolkata", latitude: 22.5646, longitude: 88.351, name: "Kolkata" },
  { code: "agra", latitude: 27.1767, longitude: 78.0081, name: "Agra" },
  { code: "ahmedabad", latitude: 23.0225, longitude: 72.5714, name: "Ahmedabad" },
  { code: "bengaluru", latitude: 12.9716, longitude: 77.5946, name: "Bengaluru" },
  { code: "bhopal", latitude: 23.2599, longitude: 77.4126, name: "Bhopal" },
  { code: "chennai", latitude: 13.0827, longitude: 80.2707, name: "Chennai" },
  { code: "delhi", latitude: 28.6139, longitude: 77.209, name: "Delhi NCR" },
  { code: "hyderabad", latitude: 17.385, longitude: 78.4867, name: "Hyderabad" },
  { code: "indore", latitude: 22.7196, longitude: 75.8577, name: "Indore" },
  { code: "jaipur", latitude: 26.9124, longitude: 75.7873, name: "Jaipur" },
  { code: "kanpur", latitude: 26.4499, longitude: 80.3319, name: "Kanpur" },
  { code: "kochi", latitude: 9.9312, longitude: 76.2673, name: "Kochi" },
  { code: "lucknow", latitude: 26.8467, longitude: 80.9462, name: "Lucknow" },
  { code: "mumbai", latitude: 19.076, longitude: 72.8777, name: "Mumbai" },
  { code: "nagpur", latitude: 21.1458, longitude: 79.0882, name: "Nagpur" },
  { code: "patna", latitude: 25.5941, longitude: 85.1376, name: "Patna" },
  { code: "pune", latitude: 18.5204, longitude: 73.8567, name: "Pune" },
];

/**
 * Where the picker starts: the person's current city (user, 2026-10-31). Null
 * when that city has no metro, since the list is metro cities only. With no
 * location known, Kolkata.
 */
export function defaultMetroCity(point: DevicePoint): MetroCity | null {
  if (point.latitude == null || point.longitude == null) {
    return METRO_CITIES[0];
  }
  const { latitude, longitude } = point;
  return METRO_CITIES.find((city) => distanceKm(latitude, longitude, city.latitude, city.longitude) <= SYSTEM_REACH_KM) ?? null;
}

/** Null means this city's lines are not in yet. */
export function systemForCity(systems: MetroSystem[], cityCode: string): MetroSystem | null {
  return systems.find((system) => system.code === cityCode) ?? null;
}

export function toggleStation(ticked: string[], code: string) {
  return ticked.includes(code) ? ticked.filter((item) => item !== code) : [...ticked, code];
}

export function isWholeLineTicked(ticked: string[], line: MetroLine) {
  return line.stations.every((station) => ticked.includes(station.code));
}

/** Select all: ticks every station on the line, or unticks them when all already are. */
export function toggleLine(ticked: string[], line: MetroLine) {
  const codes = line.stations.map((station) => station.code);
  return isWholeLineTicked(ticked, line)
    ? ticked.filter((code) => !codes.includes(code))
    : [...ticked, ...codes.filter((code) => !ticked.includes(code))];
}

export function ticksOnLine(ticked: string[], line: MetroLine) {
  return line.stations.filter((station) => ticked.includes(station.code)).length;
}

/** The ticked stations, each once though an interchange is under two lines. */
export function tickedStations(systems: MetroSystem[], ticked: string[]) {
  const byCode = new Map<string, MetroStation>();
  for (const system of systems) {
    for (const line of system.lines) {
      for (const station of line.stations) {
        byCode.set(station.code, station);
      }
    }
  }
  return ticked.flatMap((code) => {
    const station = byCode.get(code);
    return station ? [station] : [];
  });
}

/** How tall a wrapped list of chips is at this many rows. */
export function chipRowsHeight(rowHeight: number, gap: number, rows: number) {
  return rowHeight * rows + gap * (rows - 1);
}

/** How the "Searched around" pill names a ticked search. */
export function metroSearchLabel(count: number) {
  return `${count} metro station${count === 1 ? "" : "s"}`;
}

export function stationCountLabel(count: number) {
  return `${count} station${count === 1 ? "" : "s"} selected`;
}

/** The line under Listing Results while stations are ticked. */
export function metroResultLine(stationNames: string[], count: number) {
  const named =
    stationNames.length > 2
      ? `${stationNames.slice(0, 2).join(", ")} and ${stationNames.length - 2} more`
      : stationNames.join(", ");
  const listings = count === 0 ? "No matching listing" : `${count} listing${count === 1 ? "" : "s"}`;
  return `${listings} within 5 km of ${named}`;
}

/** Black or white, whichever reads on a line's colour. Yellow does not take white text. */
export function textOnLineColour(colour: string) {
  const value = parseInt(colour.slice(1), 16);
  const luminance = (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}
