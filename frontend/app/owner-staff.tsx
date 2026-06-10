import { useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeftRight, Building2, ChevronRight, Plus, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import {
  ActionButton,
  BackButton,
  ConfirmDialog,
  FormInput,
  IconButton,
  shortId,
} from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useAddPropertyManagerMutation,
  useLazyLookupManagerQuery,
  useListMyPropertiesQuery,
  useListPropertyManagersQuery,
  useRemovePropertyManagerMutation,
  useShiftPropertyManagerMutation,
  type ManagerLookup,
  type OwnerProperty,
  type PropertyManager,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerStaffScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  const currentUserId = useAppSelector((state) => state.auth.user?.id) ?? null;
  const managersQuery = useListPropertyManagersQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const [removeManager] = useRemovePropertyManagerMutation();
  const [shiftManager] = useShiftPropertyManagerMutation();
  const managers = (managersQuery.data ?? []).filter((manager) => manager.active);

  const ownsSelected = Boolean(selectedProperty && currentUserId && selectedProperty.ownerId === currentUserId);
  const shiftTargets =
    ownsSelected && selectedProperty
      ? properties.filter((property) => property.ownerId === currentUserId && property.id !== selectedProperty.id)
      : [];

  const [addOpen, setAddOpen] = useState(false);
  const [detailManager, setDetailManager] = useState<PropertyManager | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PropertyManager | null>(null);
  const [pendingShift, setPendingShift] = useState<{ manager: PropertyManager; target: OwnerProperty } | null>(null);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={ShieldCheck}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property whose managers you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Managers
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]} selectable>
              {selectedProperty.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]} selectable>
              Managers can run day-to-day operations for this property — tenancies, billing, concerns and notices.
            </Text>
          </Card>

          <ActionButton icon={Plus} label="Add manager" onPress={() => setAddOpen(true)} />

          <Section eyebrow="Staff" title={`${managers.length} manager${managers.length === 1 ? "" : "s"}`}>
            {managersQuery.isFetching && managers.length === 0 ? (
              <Card>
                <ActivityIndicator color={colors.primary} />
              </Card>
            ) : managers.length === 0 ? (
              <EmptyState
                icon={UserRound}
                eyebrow="No managers"
                title="No managers yet"
                description="Add a manager by phone number to delegate property operations."
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {managers.map((manager) => (
                  <ManagerCard key={manager.id} manager={manager} onOpen={() => setDetailManager(manager)} />
                ))}
              </View>
            )}
          </Section>
        </>
      ) : null}

      {addOpen && selectedProperty ? (
        <AddManagerModal propertyId={selectedProperty.id} onClose={() => setAddOpen(false)} />
      ) : null}

      {detailManager ? (
        <ManagerDetailModal
          manager={detailManager}
          onClose={() => setDetailManager(null)}
          onRemove={() => {
            const target = detailManager;
            setDetailManager(null);
            setPendingRemove(target);
          }}
          onShift={(target) => {
            const manager = detailManager;
            setDetailManager(null);
            setPendingShift({ manager, target });
          }}
          shiftTargets={shiftTargets}
        />
      ) : null}

      {pendingShift && selectedProperty ? (
        <ConfirmDialog
          confirmLabel="Shift"
          message={`Shift ${pendingShift.manager.managerFullName || pendingShift.manager.managerPhone} to ${pendingShift.target.name}? They will stop managing ${selectedProperty.name}.`}
          onCancel={() => setPendingShift(null)}
          onConfirm={() => {
            const { manager, target } = pendingShift;
            setPendingShift(null);
            void shiftManager({ managerUserId: manager.managerUserId, propertyId: selectedProperty.id, targetPropertyId: target.id });
          }}
          title="Shift manager?"
        />
      ) : null}

      {pendingRemove ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={`Remove ${pendingRemove.managerFullName || pendingRemove.managerPhone} as a manager of this property?`}
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const target = pendingRemove;
            setPendingRemove(null);
            if (selectedProperty) {
              void removeManager({ managerUserId: target.managerUserId, propertyId: selectedProperty.id });
            }
          }}
          title="Remove manager?"
        />
      ) : null}
    </ScreenScrollView>
  );
}

function ManagerCard({ manager, onOpen }: { manager: PropertyManager; onOpen: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable accessibilityRole="button" onPress={onOpen}>
      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          {manager.managerProfilePhotoUrl ? (
            <Image source={{ uri: manager.managerProfilePhotoUrl }} style={{ borderRadius: 21, height: 42, width: 42 }} />
          ) : (
            <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 21, height: 42, justifyContent: "center", width: 42 }}>
              <UserRound color={colors.primary} size={20} strokeWidth={2.2} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "500" }} selectable>
              {manager.managerFullName || `Manager ${shortId(manager.managerUserId)}`}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              {manager.managerPhone}
            </Text>
          </View>
          <ChevronRight color={colors.kicker} size={18} strokeWidth={2.2} />
        </View>
      </Card>
    </AnimatedPressable>
  );
}

function ManagerDetailModal({
  manager,
  onClose,
  onRemove,
  onShift,
  shiftTargets,
}: {
  manager: PropertyManager;
  onClose: () => void;
  onRemove: () => void;
  onShift: (target: OwnerProperty) => void;
  shiftTargets: OwnerProperty[];
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "88%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Manager
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} showsVerticalScrollIndicator>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
              {manager.managerProfilePhotoUrl ? (
                <Image source={{ uri: manager.managerProfilePhotoUrl }} style={{ borderRadius: 30, height: 60, width: 60 }} />
              ) : (
                <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 30, height: 60, justifyContent: "center", width: 60 }}>
                  <UserRound color={colors.primary} size={28} strokeWidth={2.2} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
                  {manager.managerFullName || `Manager ${shortId(manager.managerUserId)}`}
                </Text>
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  {manager.managerPhone} · Manager
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Verification
              </Text>
              <VerificationRow label="Phone verified" status={manager.phoneVerified ? "yes" : "no"} />
              <VerificationRow label="Profile completed" status={manager.profileCompleted ? "yes" : "no"} />
              <VerificationRow label="Account active" status={manager.accountActive ? "yes" : "no"} />
              <VerificationRow label="eKYC done" status="pending" />
              <VerificationRow label="Documents verified" status="pending" />
              <Text style={[type.caption, { color: colors.kicker, marginTop: spacing.xs }]} selectable>
                eKYC and document verification will appear here once the verification module is enabled.
              </Text>
            </View>

            <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Assignment
              </Text>
              <DetailRow label="Manager ID" value={shortId(manager.managerUserId)} />
              <DetailRow label="Assigned on" value={formatDate(manager.createdAt)} />
            </View>

            {shiftTargets.length ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  Shift to another property
                </Text>
                {shiftTargets.map((target) => (
                  <AnimatedPressable
                    accessibilityRole="button"
                    key={target.id}
                    onPress={() => onShift(target)}
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: 14,
                      borderWidth: 1,
                      flexDirection: "row",
                      gap: spacing.md,
                      padding: spacing.md,
                    }}
                  >
                    <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, height: 38, justifyContent: "center", width: 38 }}>
                      <Building2 color={colors.primary} size={18} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1} selectable>
                        {target.name}
                      </Text>
                      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1} selectable>
                        {[target.city, target.state].filter(Boolean).join(", ") || "Tap to shift here"}
                      </Text>
                    </View>
                    <ArrowLeftRight color={colors.primary} size={18} strokeWidth={2.2} />
                  </AnimatedPressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: "row" }}>
            <ActionButton icon={Trash2} label="Remove manager" onPress={onRemove} variant="danger" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function VerificationRow({ label, status }: { label: string; status: "yes" | "no" | "pending" }) {
  const { colors, type } = useTheme();
  const tone = status === "yes" ? colors.successText : status === "no" ? colors.danger : colors.muted;
  const text = status === "yes" ? "Yes" : status === "no" ? "No" : "Not available";
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: tone, fontWeight: "800" }]} selectable>
        {text}
      </Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "700" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function AddManagerModal({ onClose, propertyId }: { onClose: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ManagerLookup | null>(null);
  const [runLookup, lookupState] = useLazyLookupManagerQuery();
  const [addManager, { isLoading }] = useAddPropertyManagerMutation();

  function changePhone(value: string) {
    setPhone(value);
    setLookup(null);
    setError(null);
  }

  async function doLookup() {
    if (!/^\d{10,15}$/.test(phone.trim())) {
      setError("Enter a valid phone number.");
      return;
    }
    setError(null);
    try {
      const result = await runLookup({ phone: phone.trim(), propertyId }).unwrap();
      setLookup(result);
      if (result.exists && result.fullName) {
        setFullName(result.fullName);
      }
    } catch {
      setError("Lookup failed. Please try again.");
    }
  }

  async function submit() {
    if (isLoading || !lookup) {
      return;
    }
    if (!lookup.eligible) {
      setError(lookup.message);
      return;
    }
    if (!fullName.trim()) {
      setError("Enter the manager's name.");
      return;
    }
    setError(null);
    try {
      await addManager({ payload: { fullName: fullName.trim(), phone: phone.trim() }, propertyId }).unwrap();
      onClose();
    } catch {
      setError("Could not add this manager. Please try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.md, padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} selectable>
              Add manager
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <Text style={[type.caption, { color: colors.muted }]} selectable>
            Look up the phone first. If the person has no account, one is created and they are notified.
          </Text>

          <FormInput keyboardType="phone-pad" label="Phone number" onChangeText={changePhone} placeholder="10-digit phone" value={phone} />
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={lookupState.isFetching}
              icon={Search}
              label={lookupState.isFetching ? "Looking up" : "Look up"}
              onPress={() => void doLookup()}
              variant="secondary"
            />
          </View>

          {lookup ? (
            <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, gap: spacing.xs, padding: spacing.md }}>
              <Text style={[type.caption, { color: lookup.eligible ? colors.successText : colors.danger, fontWeight: "800" }]} selectable>
                {lookup.exists ? `Existing user${lookup.fullName ? ` · ${lookup.fullName}` : ""}` : "New user"}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                {lookup.message}
              </Text>
            </View>
          ) : null}

          {lookup?.eligible ? (
            <FormInput label="Full name" onChangeText={setFullName} placeholder="Manager name" value={fullName} />
          ) : null}

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]} selectable>
              {error}
            </Text>
          ) : null}

          {lookup?.eligible ? (
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={isLoading} icon={Plus} label={isLoading ? "Adding" : "Assign manager"} onPress={() => void submit()} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
