import { useEffect, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { SheetShell } from "@/components/sheet-shell";
import { FoodProfilesSkeleton } from "@/components/skeletons";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { FoodProfileMark, FoodStatusChip, NoDescription, foodIcon } from "@/features/food/food-ui";
import { FoodProfileSubscribersSheet } from "@/features/food/owner-food-subscribers";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import {
  useCreateFoodProfileMutation,
  useDeactivateFoodProfileMutation,
  useUpdateFoodProfileMutation,
  type FoodProfile,
  type FoodProfileSubscriberSummary,
  type FoodSubscriber,
} from "@/store/services/food-api";

/**
 * The diets this property offers, and how many people are on each.
 *
 * <p>A profile is the unit a tenant subscribes to and the unit the kitchen
 * cooks for, so the subscriber count sits on the card rather than a tab away —
 * it is what decides whether a profile is worth keeping on the menu at all.
 */
export function FoodProfilesTab({
  createRequest = 0,
  onOpenMenu,
  profiles,
  loading,
  propertyId,
  readOnly,
  subscribers,
  subscribersLoading,
}: {
  createRequest?: number;
  onOpenMenu: (profile: FoodProfile) => void;
  profiles: FoodProfileSubscriberSummary[];
  loading: boolean;
  propertyId: string;
  readOnly: boolean;
  subscribers: FoodSubscriber[];
  subscribersLoading: boolean;
}) {
  const [editing, setEditing] = useState<FoodProfile | "new" | null>(null);
  const [retiring, setRetiring] = useState<FoodProfileSubscriberSummary | null>(null);
  const [viewingSubscribers, setViewingSubscribers] = useState<FoodProfileSubscriberSummary | null>(null);
  const [deactivate, deactivateState] = useDeactivateFoodProfileMutation();
  const opErrors = useFormErrors<never>();
  const toast = useToast();

  // Only a FRESH press opens the sheet. This tab unmounts when another one is
  // shown, so on the way back the effect ran again against a counter that was
  // still non-zero from the last press — and the create-profile sheet opened by
  // itself every time the tab was visited. Remembering the value seen at mount
  // makes the effect react to the increment rather than to the number.
  const handledCreateRequest = useRef(createRequest);
  useEffect(() => {
    if (createRequest > handledCreateRequest.current) {
      handledCreateRequest.current = createRequest;
      setEditing("new");
    }
  }, [createRequest]);

  async function retire(summary: FoodProfileSubscriberSummary) {
    setRetiring(null);
    try {
      await deactivate({ profileId: summary.profile.id, propertyId }).unwrap();
      toast.ok(`${summary.profile.name} retired`);
    } catch (error) {
      opErrors.failFromServer(errorMessage(error));
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <NoticeBar
        message="A profile is one set of meals. Tenants pick exactly one, and the kitchen cooks each profile separately."
        title="How profiles work"
        tone="info"
      />

      {loading && profiles.length === 0 ? <FoodProfilesSkeleton rows={2} /> : null}

      {!loading && profiles.length === 0 ? (
        <EmptyState
          artwork={require("../../../assets/workspace/food-module-no-profiles.png")}
          description="Create one profile per diet you cook for, like vegetarian, non-vegetarian or Jain."
          title="No food profiles yet"
        />
      ) : null}

      {profiles.map((summary) => (
        <ProfileCard
          key={summary.profile.id}
          onEdit={() => setEditing(summary.profile)}
          onOpenMenu={() => onOpenMenu(summary.profile)}
          onRetire={() => setRetiring(summary)}
          onViewSubscribers={() => setViewingSubscribers(summary)}
          readOnly={readOnly}
          summary={summary}
        />
      ))}

      {editing ? (
        <FoodProfileSheet
          onClose={() => setEditing(null)}
          profile={editing === "new" ? null : editing}
          propertyId={propertyId}
        />
      ) : null}

      {retiring ? (
        <ConfirmDialog
          bullets={[
            "Its weekly menu stops being cooked.",
            "It cannot be brought back — you would create it again as a new profile.",
          ]}
          confirmLabel={deactivateState.isLoading ? "Retiring…" : "Retire profile"}
          destructive
          footnote={
            retiring.subscriberCount > 0
              ? `${retiring.subscriberCount} ${retiring.subscriberCount === 1 ? "tenant is" : "tenants are"} still on it, so this will be refused until they move.`
              : "Nobody is subscribed to it."
          }
          message={`${retiring.profile.name} will be retired from this property.`}
          onCancel={() => setRetiring(null)}
          onConfirm={() => void retire(retiring)}
          title="Retire this profile?"
        />
      ) : null}

      {viewingSubscribers ? (
        <FoodProfileSubscribersSheet
          loading={subscribersLoading}
          onClose={() => setViewingSubscribers(null)}
          profileName={viewingSubscribers.profile.name}
          subscribers={subscribers.filter((person) => person.profileId === viewingSubscribers.profile.id)}
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}

function ProfileCard({
  onEdit,
  onOpenMenu,
  onRetire,
  onViewSubscribers,
  readOnly,
  summary,
}: {
  onEdit: () => void;
  onOpenMenu: () => void;
  onRetire: () => void;
  onViewSubscribers: () => void;
  readOnly: boolean;
  summary: FoodProfileSubscriberSummary;
}) {
  const { colors, fonts, type } = useTheme();
  const { profile, subscriberCount } = summary;
  return (
    <View
      style={{
        borderColor: colors.border,
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
        <FoodProfileMark name={profile.name} size={48} />
        <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, flex: 1 }]}>
              {profile.name}
            </Text>
            <FoodStatusChip icon="check-circle" label="Active" tone="success" />
          </View>
          {profile.description ? (
            <Text numberOfLines={3} style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
              {profile.description}
            </Text>
          ) : (
            <NoDescription />
          )}
        </View>
      </View>

      <AnimatedPressable
        accessibilityLabel={`View ${profile.name} subscribers`}
        accessibilityRole="button"
        onPress={onViewSubscribers}
        style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.xs }}
      >
        <MaterialCommunityIcons color={colors.primary} name="account-group" size={18} />
        <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>
          {subscriberCount}
        </Text>
        <Text style={{ color: colors.primary, fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
          {subscriberCount === 1 ? "subscriber" : "subscribers"}
        </Text>
        <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={17} />
      </AnimatedPressable>

      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        <ActionButton
          compact
          icon={foodIcon("calendar-edit")}
          label={readOnly ? "View menu" : "Weekly menu"}
          onPress={onOpenMenu}
          variant="secondary"
        />
        {!readOnly ? <ActionButton compact icon={foodIcon("pencil-outline")} label="Edit" onPress={onEdit} variant="secondary" /> : null}
      </View>
      {!readOnly ? <ActionButton compact label="Retire profile" onPress={onRetire} variant="danger" /> : null}
    </View>
  );
}

type Field = "name";

function FoodProfileSheet({
  onClose,
  profile,
  propertyId,
}: {
  onClose: () => void;
  profile: FoodProfile | null;
  propertyId: string;
}) {
  const toast = useToast();
  const form = useFormErrors<Field>();
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [create, createState] = useCreateFoodProfileMutation();
  const [update, updateState] = useUpdateFoodProfileMutation();
  const saving = createState.isLoading || updateState.isLoading;

  async function submit() {
    const trimmed = name.trim();
    if (!form.validate(trimmed ? {} : { name: "Name this profile." })) {
      return;
    }

    // displayOrder is left to the server. Ordering profiles by hand is a
    // control nobody asked for, and an owner with three of them will never
    // reach for it.
    const body = { description: description.trim() || null, name: trimmed };

    try {
      if (profile) {
        await update({ body, profileId: profile.id, propertyId }).unwrap();
        toast.ok(`${trimmed} updated`);
      } else {
        await create({ body, propertyId }).unwrap();
        toast.ok(`${trimmed} created`);
      }
      onClose();
    } catch (error) {
      form.failFromServer(errorMessage(error));
    }
  }

  return (
    <SheetShell animated onClose={onClose} title={profile ? "Edit food profile" : "Create food profile"}>
      <FormInput
        error={form.errors.name}
        label="Name"
        maxLength={100}
        onChangeText={(next) => {
          setName(next);
          form.clearField("name");
        }}
        placeholder="Vegetarian"
        required
        value={name}
      />
      <FormInput
        label="Description"
        maxLength={500}
        multiline
        onChangeText={setDescription}
        placeholder="Pure vegetarian meals, no onion or garlic"
        value={description}
      />
      <View style={{ flexDirection: "row" }}>
        <ActionButton
          disabled={saving || form.blocked}
          label={saving ? "Saving…" : profile ? "Save changes" : "Create profile"}
          onPress={() => void submit()}
        />
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}
