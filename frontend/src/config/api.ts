import Constants from "expo-constants";
import { Platform } from "react-native";

const backendPort = 8080;

function expoHostUri() {
  const constants = Constants as typeof Constants & {
    manifest2?: {
      extra?: {
        expoClient?: {
          hostUri?: string;
        };
      };
    };
  };

  return Constants.expoConfig?.hostUri ?? constants.manifest2?.extra?.expoClient?.hostUri ?? null;
}

function hostNameFromUri(uri: string) {
  const normalizedUri = uri.includes("://") ? uri : `http://${uri}`;

  try {
    return new URL(normalizedUri).hostname;
  } catch {
    return uri.split(":")[0] || null;
  }
}

// export function resolveDefaultApiBaseUrl() {
//   if (Platform.OS === "web") {
//     return "http://localhost:8080";
//   }

//   const hostUri = expoHostUri();
//   const hostName = hostUri ? hostNameFromUri(hostUri) : null;

//   if (hostName) {
//     return `http://${hostName}:${backendPort}`;
//   }

//   return "http://localhost:8080";
// }

/**
 * Cleans a base URL before anything is concatenated onto it.
 *
 * <p>Applied at the SOURCE rather than by each caller. A stray trailing space
 * in the tunnel URL below cost an afternoon: the RTK Query base query trims its
 * copy, so every ordinary API call worked, while the upload path read the value
 * raw and built "https://host /api/v1/uploads/signature" — a URL with a space
 * between the host and the path, which fails to parse. The symptom was
 * "uploads are broken over the tunnel" and the cause was one character.
 *
 * <p>Trailing slashes go for the same reason: every caller appends a path that
 * already starts with one, and "//api" is not the same route.
 */
export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.replace(/\/+$/, "") : trimmed;
}

export function resolveDefaultApiBaseUrl() {
  return normalizeApiBaseUrl("");
}

export const defaultApiBaseUrl = resolveDefaultApiBaseUrl();
