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

export function resolveDefaultApiBaseUrl() {
  return "https://headcount-handbrake-cotton.ngrok-free.dev";
}

export const defaultApiBaseUrl = resolveDefaultApiBaseUrl();
