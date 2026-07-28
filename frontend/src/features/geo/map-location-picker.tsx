import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Location from "expo-location";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { ArrowLeft, Crosshair, Home, MapPin } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SearchField } from "@/components/search-field";
import { useToast } from "@/components/toast";
import { ActionButton } from "@/features/owner/owner-ui";
import {
  useLazyReverseGeocodeQuery,
  useLazySearchLocationsQuery,
  type GeoSuggestion,
  type ReverseGeocode,
} from "@/store/services/geo-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Free, keyless vector style (OpenFreeMap). Swappable without touching code
// elsewhere — the renderer is style-agnostic.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

function round7(value: number) {
  return Math.round(value * 1e7) / 1e7;
}

// Wide view of India used when the picker opens with no starting point.
const INDIA_CENTER: [number, number] = [78.9629, 21.5937];
const INDIA_ZOOM = 3.6;
const PICK_ZOOM = 16;

export type PickedLocation = {
  latitude: number;
  longitude: number;
  // Null when reverse geocoding had no answer (keyless dev mode, vendor miss);
  // callers fall back to manual address entry.
  address: ReverseGeocode | null;
};

export type MapLocationPickerProps = {
  /** Panel heading, e.g. "Property location" / "Pin this place". */
  title?: string;
  /** Where the pin starts; defaults to the home marker, else an India-wide view. */
  initial?: { latitude: number; longitude: number };
  /** Fixed reference marker — the PG itself — shown while pinning nearby places. */
  home?: { latitude: number; longitude: number; label?: string };
  onClose: () => void;
  onPick: (result: PickedLocation) => void;
};

// MapLibre is a native module absent from Expo Go — requiring it there would
// crash. The guard keeps the rest of the app fully Expo Go-friendly; only this
// picker demands a dev build.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const maplibre: typeof import("@maplibre/maplibre-react-native") | null = (() => {
  if (isExpoGo) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@maplibre/maplibre-react-native");
  } catch {
    return null;
  }
})();

/**
 * Full-screen map location picker rendered as a nested modal, so it can open
 * from anywhere — including screens that are themselves native modals (route
 * pushes would render UNDER those).
 */
export function MapLocationPickerModal(props: MapLocationPickerProps) {
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} statusBarTranslucent visible>
      {maplibre ? <PickerMap {...props} /> : <DevBuildRequiredScreen onBack={props.onClose} />}
    </Modal>
  );
}

function PickerMap({ home, initial, onClose, onPick, title }: MapLocationPickerProps) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { Camera, Map: MapView, Marker } = maplibre!;

  const start = initial ?? home ?? null;
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(
    start ? { latitude: start.latitude, longitude: start.longitude } : null,
  );
  const [address, setAddress] = useState<ReverseGeocode | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [locating, setLocating] = useState(false);

  const cameraRef = useRef<CameraRef>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseSequence = useRef(0);

  const [triggerSearch] = useLazySearchLocationsQuery();
  const [triggerReverse] = useLazyReverseGeocodeQuery();

  const resolveAddress = useCallback(
    (latitude: number, longitude: number) => {
      const sequence = ++reverseSequence.current;
      setResolvingAddress(true);
      if (reverseTimer.current) {
        clearTimeout(reverseTimer.current);
      }
      reverseTimer.current = setTimeout(() => {
        triggerReverse({ lat: latitude, lng: longitude })
          .unwrap()
          .then((result) => {
            if (sequence === reverseSequence.current) {
              setAddress(result);
            }
          })
          .catch(() => {
            if (sequence === reverseSequence.current) {
              setAddress(null);
            }
          })
          .finally(() => {
            if (sequence === reverseSequence.current) {
              setResolvingAddress(false);
            }
          });
      }, 450);
    },
    [triggerReverse],
  );

  // Resolve the starting point's address once.
  useEffect(() => {
    if (start) {
      resolveAddress(start.latitude, start.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(text: string) {
    setSearchDraft(text);
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    const query = text.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      triggerSearch({
        q: query,
        nearLat: center?.latitude,
        nearLng: center?.longitude,
      })
        .unwrap()
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 350);
  }

  function pickSuggestion(suggestion: GeoSuggestion) {
    if (suggestion.latitude == null || suggestion.longitude == null) {
      return;
    }
    setSuggestions([]);
    setSearchDraft(suggestion.name ?? "");
    cameraRef.current?.easeTo({
      center: [suggestion.longitude, suggestion.latitude],
      zoom: PICK_ZOOM,
      duration: 600,
    });
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        toast.error("Location permission was denied.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      cameraRef.current?.easeTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: PICK_ZOOM,
        duration: 600,
      });
    } catch {
      toast.error("Could not read your current location.");
    } finally {
      setLocating(false);
    }
  }

  function confirm() {
    if (!center) {
      return;
    }
    // Backend coordinate columns are NUMERIC(10,7) with @Digits validation, so
    // clamp the raw map doubles (14+ decimal places) to 7 (~1 cm precision).
    onPick({ latitude: round7(center.latitude), longitude: round7(center.longitude), address });
    onClose();
  }

  const addressLine = useMemo(() => {
    if (resolvingAddress) {
      return "Resolving address…";
    }
    if (address?.formattedAddress) {
      return address.formattedAddress;
    }
    if (center) {
      return `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}`;
    }
    return "Move the map to drop the pin";
  }, [address, center, resolvingAddress]);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <MapView
        mapStyle={MAP_STYLE_URL}
        attributionPosition={{ bottom: 8, left: 8 }}
        onRegionDidChange={(event) => {
          const [longitude, latitude] = event.nativeEvent.center;
          setCenter({ latitude, longitude });
          resolveAddress(latitude, longitude);
        }}
        style={{ flex: 1 }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={
            start
              ? { center: [start.longitude, start.latitude], zoom: PICK_ZOOM }
              : { center: INDIA_CENTER, zoom: INDIA_ZOOM }
          }
        />
        {home ? (
          <Marker anchor="bottom" lngLat={[home.longitude, home.latitude]}>
            <View style={{ alignItems: "center", gap: 2 }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                  borderRadius: 999,
                  borderWidth: 2,
                  padding: 6,
                }}
              >
                <Home color={colors.primary} size={16} strokeWidth={2.4} />
              </View>
              {home.label ? (
                <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 10, fontWeight: "800" }}>
                    {home.label}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Fixed pin: the map pans underneath; the tip marks the picked point. */}
      <View pointerEvents="none" style={{ alignItems: "center", bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 }}>
        <View style={{ transform: [{ translateY: -17 }] }}>
          <MapPin color={colors.danger} fill={colors.dangerSoft} size={34} strokeWidth={2.2} />
        </View>
      </View>

      {/* Top bar: back + search with disambiguating suggestions. */}
      <View style={{ gap: spacing.xs, left: spacing.md, position: "absolute", right: spacing.md, top: insets.top + spacing.sm }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <AnimatedPressable
            accessibilityLabel="Back"
            onPress={onClose}
            style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", width: 44 }}
          >
            <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
          </AnimatedPressable>
          <View style={{ flex: 1 }}>
            <SearchField animatePlaceholder={false} onChangeText={onSearchChange} placeholder="Search area, landmark or pincode" value={searchDraft} />
          </View>
        </View>

        {suggestions.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
            {suggestions.slice(0, 6).map((suggestion, index) => (
              <AnimatedPressable
                accessibilityRole="button"
                key={`${suggestion.providerPlaceId ?? suggestion.name}-${index}`}
                onPress={() => pickSuggestion(suggestion)}
                style={{ borderColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, gap: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
              >
                <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
                  {suggestion.name ?? "Unnamed place"}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                  {suggestion.address ?? "—"}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Bottom panel: resolved address + confirm. */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 20,
          borderWidth: 1,
          bottom: insets.bottom + spacing.md,
          gap: spacing.sm,
          left: spacing.md,
          padding: spacing.md,
          position: "absolute",
          right: spacing.md,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>{title ?? "Pin location"}</Text>
            <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} numberOfLines={2}>
              {addressLine}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityLabel="Use my location"
            onPress={() => void useMyLocation()}
            style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 21, height: 42, justifyContent: "center", width: 42 }}
          >
            {locating ? <ActivityIndicator color={colors.primary} size="small" /> : <Crosshair color={colors.primary} size={20} strokeWidth={2.2} />}
          </AnimatedPressable>
        </View>
        <ActionButton disabled={!center || resolvingAddress} label="Confirm location" onPress={confirm} />
      </View>
    </View>
  );
}

function DevBuildRequiredScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.background, flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.lg, paddingTop: insets.top + spacing.lg }}>
      <EmptyState
        icon={MapPin}
        eyebrow="Development build needed"
        title="Maps need a dev build"
        description={
          "The map picker uses a native module that Expo Go cannot load. Build and install the development app once with: npx expo run:android — then reopen this screen."
        }
      />
      <ActionButton label="Go back" onPress={onBack} variant="secondary" />
    </View>
  );
}
