import { useRef, useState, type ComponentType, type ReactNode, type Ref } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { Stack } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * THROWAWAY spike, 2026-09-13. Delete once the question is answered.
 *
 * The question: can Mappls' own map place a pin from a place's Mappls ID
 * alone? Our REST key returns an ID (eLoc) for every Nearby result but no
 * coordinates, so the tenant nearby map depends entirely on this.
 *
 * Open it on the dev build with:
 *   adb shell am start -W -a android.intent.action.VIEW -d "khatiyan://mappls-spike" com.khatiyan.app
 */

// Just the parts of the SDK this spike touches. Its own types ship as .ts
// sources that do not compile against React 19's types, and importing them
// would put those errors into the app's type check.
type CameraRef = {
  flyTo: (coordinates: number[], animationDuration?: number) => void;
  flyWithMapplsPin: (mapplsPin: string, animationDuration?: number) => void;
};
type MapplsSdk = {
  Camera: ComponentType<{ centerCoordinate?: number[]; ref?: Ref<CameraRef>; zoomLevel?: number }>;
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

// Loaded only when this screen mounts, never at module scope. Expo Router loads
// every route file at startup, and requiring the SDK initialises Mappls on the
// spot: with an invalid licence that threw a host exception that took the WHOLE
// app down on launch (stuck on the splash), not just this screen. It also does
// not exist in Expo Go or on web.
function loadMappls(): MapplsSdk | null {
  if (Platform.OS === "web" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("mappls-map-react-native");
  } catch {
    return null;
  }
}

// The reference point of the live Nearby call (Salt Lake, Kolkata) that
// returned the ID below.
const REFERENCE: [number, number] = [88.4337, 22.5726];
// Apollo Hospitals, 365 m from the reference. An ID only, no coordinates.
const APOLLO_PIN = "HWEAC2";

export default function MapplsSpikeScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const [status, setStatus] = useState("Loading map…");
  const [mappls] = useState(loadMappls);

  if (!mappls) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: 24 }}>
        <Stack.Screen options={{ title: "Mappls spike" }} />
        <Text>The Mappls map needs the Android dev build.</Text>
      </View>
    );
  }

  const { Camera, MapView, PointAnnotation } = mappls;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Mappls spike" }} />
      <MapView
        onDidFinishLoadingMap={() => setStatus("Map loaded. Red = pinned by Mappls ID, blue = by coordinates.")}
        onMapError={(error) => setStatus(`Map error ${error.code}: ${error.message ?? "no message"}`)}
        style={{ flex: 1 }}
      >
        <Camera centerCoordinate={REFERENCE} ref={cameraRef} zoomLevel={15} />
        <PointAnnotation
          id="apollo-by-id"
          mapplsPin={APOLLO_PIN}
          onSelected={() => setStatus(`Tapped the pin placed by ID ${APOLLO_PIN}`)}
          title="Apollo Hospitals"
        >
          <View style={{ backgroundColor: "#D32F2F", borderColor: "#FFFFFF", borderRadius: 10, borderWidth: 3, height: 20, width: 20 }} />
        </PointAnnotation>
        <PointAnnotation coordinate={REFERENCE} id="reference">
          <View style={{ backgroundColor: "#1565C0", borderColor: "#FFFFFF", borderRadius: 10, borderWidth: 3, height: 20, width: 20 }} />
        </PointAnnotation>
      </MapView>

      <View style={{ backgroundColor: "#FFFFFF", gap: 8, padding: 16 }}>
        <Text selectable>{status}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => cameraRef.current?.flyWithMapplsPin(APOLLO_PIN, 800)}
            style={{ backgroundColor: "#EEEEEE", borderRadius: 8, padding: 10 }}
          >
            <Text>Fly to Apollo by ID</Text>
          </Pressable>
          <Pressable
            onPress={() => cameraRef.current?.flyTo(REFERENCE, 800)}
            style={{ backgroundColor: "#EEEEEE", borderRadius: 8, padding: 10 }}
          >
            <Text>Back to reference</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
