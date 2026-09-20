import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform, type ViewStyle } from "react-native";
import type { ComponentType, ReactNode, Ref } from "react";

/**
 * The Mappls native SDK, loaded only when a map is actually on screen.
 *
 * <p><b>Never at module scope.</b> Expo Router loads every route file at
 * startup, and requiring this package initialises Mappls on the spot. With a
 * licence the SDK rejects, that threw a host exception which took the WHOLE app
 * down on launch — stuck on the splash, not merely a broken screen.
 *
 * <p>Also absent from Expo Go and from web, where the import throws rather than
 * degrading. Every caller must handle null.
 */

/** Only the parts of the SDK this app touches. */
export type MapplsCameraRef = {
  flyTo: (coordinates: number[], animationDuration?: number) => void;
  flyWithMapplsPin: (mapplsPin: string, animationDuration?: number) => void;
};

type MapplsLog = { level: string; message: string; tag?: string };

type MapplsWithLogger = MapplsSdk & {
  Logger?: { setLogCallback: (callback: (log: MapplsLog) => boolean) => void };
};

/**
 * Noise the SDK emits on every map load, as console ERRORS.
 *
 * <p>Nothing is wrong: these are optional native methods the licence does not
 * include, and the map draws perfectly without them. But LogBox does not know
 * that, so each one threw a full red error card over the map every single time
 * it opened — burying any real error underneath it.
 *
 * <p>Matched on the message rather than silencing the logger wholesale, so a
 * genuine SDK failure still gets through.
 */
const HARMLESS_SDK_LOGS = [
  // Optional native methods the licence does not include. The map draws
  // perfectly without them.
  /Method not Provisioned/i,
  // A tile that failed to fetch or decode. The SDK retries on the next pan or
  // zoom, and the terrain ("dem") source is not even drawn in our style — but
  // each failure threw a red card over the map while it was still loading.
  /Failed to load tile/i,
  /bitmap decoding/i,
];

export type MapplsSdk = {
  Camera: ComponentType<{
    centerCoordinate?: number[];
    ref?: Ref<MapplsCameraRef>;
    zoomLevel?: number;
  }>;
  MapView: ComponentType<{
    children?: ReactNode;
    onDidFinishLoadingMap?: () => void;
    onMapError?: (error: { code: number; message?: string }) => void;
    style?: ViewStyle;
  }>;
  PointAnnotation: ComponentType<{
    children?: ReactNode;
    coordinate?: number[];
    id: string;
    mapplsPin?: string;
    onSelected?: () => void;
    title?: string;
  }>;
};

/**
 * The SDK, or null where it cannot exist.
 *
 * <p>Its own TypeScript sources do not compile against React 19's types, so
 * this is typed locally rather than imported — importing the package's types
 * would put its errors into the app's own type check.
 */
export function loadMappls(): MapplsSdk | null {
  if (Platform.OS === "web" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require("mappls-map-react-native") as MapplsWithLogger;
    silenceUnprovisionedWarnings(sdk);
    return sdk;
  } catch {
    return null;
  }
}

/**
 * Swallows the "Method not Provisioned" logs, once.
 *
 * <p>Returning true from the callback tells the SDK the log was handled and
 * stops it reaching console.error. Anything else is returned false so the
 * default logging still happens — a real failure must stay visible.
 */
let silenced = false;
function silenceUnprovisionedWarnings(sdk: MapplsWithLogger): void {
  if (silenced || !sdk.Logger?.setLogCallback) {
    return;
  }
  silenced = true;
  sdk.Logger.setLogCallback((log) =>
    HARMLESS_SDK_LOGS.some((pattern) => pattern.test(log.message ?? "")));
}

/** True where the map can render at all: a dev or production build, on a device. */
export function mapplsAvailable(): boolean {
  return loadMappls() != null;
}
