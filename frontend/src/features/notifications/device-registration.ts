import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { DevicePlatform, RegisterDeviceRequest } from "@/store/services/notification-api";

const WEB_DEVELOPMENT_TOKEN_KEY = "khatiyan.notificationDevice.webLogToken";

function resolvedPlatform(): DevicePlatform {
  if (Platform.OS === "android") {
    return "ANDROID";
  }
  if (Platform.OS === "ios") {
    return "IOS";
  }
  return "WEB";
}

export async function requestNotificationDeviceRegistration(): Promise<RegisterDeviceRequest> {
  if (Platform.OS === "web") {
    return {
      platform: "WEB",
      provider: "LOG",
      providerToken: await getWebDevelopmentToken(),
    };
  }

  if (Constants.appOwnership === "expo" && Platform.OS === "android") {
    throw new Error("Push notifications need a development build on Android. Expo Go cannot register remote push tokens.");
  }

  if (!Device.isDevice) {
    throw new Error("Push notifications need a physical device.");
  }

  const Notifications = await import("expo-notifications");
  const currentPermission = await Notifications.getPermissionsAsync();
  let permissionStatus = currentPermission.status;

  if (permissionStatus !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    permissionStatus = requestedPermission.status;
  }

  if (permissionStatus !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "Khatiyan alerts",
    });
  }

  const nativeToken = await Notifications.getDevicePushTokenAsync();
  const token = nativeToken.data;
  if (!token) {
    throw new Error("Unable to generate a device push token.");
  }

  return {
    platform: resolvedPlatform(),
    provider: Platform.OS === "android" ? "FIREBASE" : "LOG",
    providerToken: token,
  };
}

async function getWebDevelopmentToken() {
  const existingToken =
    Platform.OS === "web"
      ? window.localStorage.getItem(WEB_DEVELOPMENT_TOKEN_KEY)
      : await SecureStore.getItemAsync(WEB_DEVELOPMENT_TOKEN_KEY);

  if (existingToken) {
    return existingToken;
  }

  const token = `khatiyan-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  if (Platform.OS === "web") {
    window.localStorage.setItem(WEB_DEVELOPMENT_TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(WEB_DEVELOPMENT_TOKEN_KEY, token);
  }
  return token;
}
