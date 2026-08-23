import { useState, type ComponentType } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import * as ImagePicker from "expo-image-picker";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  Building2,
  Camera,
  Check,
  ChevronRight,
  Cog,
  Home,
  MailCheck,
  Image as ImageIcon,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  type LucideProps,
} from "lucide-react-native";

import { clearStoredSession, saveSession } from "@/auth/session-storage";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { Lightbox } from "@/components/image-carousel";
import { Section } from "@/components/section";
import { SheetShell } from "@/components/sheet-shell";
import { AlertModal } from "@/components/alert-modal";
import { FieldError } from "@/components/field-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { loadPinnedOwnerModulesForUser, saveActiveAccount } from "@/config/app-settings-storage";
import { accountDescription, accountLabel, useAvailableAccounts, type AccountType } from "@/features/account/accounts";
import { ProfileEditModal, type ProfileEditField } from "@/features/account/profile-edit-modal";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { uploadAsset } from "@/features/uploads/upload-asset";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useGetEmailRecoveryStatusQuery, useGetProfileQuery, useRequestEmailVerificationMutation, useUpdateProfileMutation, useUpdateRecoveryEmailMutation } from "@/store/services/auth-api";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import { clearActiveAccount, setActiveAccount } from "@/store/slices/account-slice";
import { clearSession, setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function AccountScreen() {
  const router = useGuardedRouter();
  const dispatch = useAppDispatch();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // "email" is the one field on this screen; everything else here is a photo or
  // permission failure with nothing on screen to correct, so it goes to the modal.
  const form = useFormErrors<"email">();
  const auth = useAppSelector((state) => state.auth);
  const activeAccount = useAppSelector((state) => state.account.activeAccount);
  const profileQuery = useGetProfileQuery();
  const emailRecoveryQuery = useGetEmailRecoveryStatusQuery(undefined, { skip: !auth.accessToken });
  const [updateRecoveryEmail, updateRecoveryEmailState] = useUpdateRecoveryEmailMutation();
  const [requestEmailVerification, requestEmailVerificationState] = useRequestEmailVerificationMutation();
  const [updateProfile, updateProfileState] = useUpdateProfileMutation();
  const user = profileQuery.data ?? auth.user;
  const { accounts, loading: accountsLoading } = useAvailableAccounts();
  const ownerPropertiesQuery = useListMyPropertiesQuery(undefined, { skip: !accounts.includes("owner") });
  const ownerPropertyCount = ownerPropertiesQuery.data?.length ?? 0;
  const accessLabel = activeAccount
    ? accountLabel(activeAccount)
    : accountsLoading
      ? "Checking"
      : accessLabelFor(user?.role, Boolean(user?.activeTenant), accounts.includes("manager"));

  async function switchAccount(account: AccountType) {
    dispatch(setActiveAccount(account));
    await saveActiveAccount(account);
    if (user?.id) {
      const pins = await loadPinnedOwnerModulesForUser(user.id);
      dispatch(setPinnedOwnerModules(pins));
    } else {
      dispatch(setPinnedOwnerModules([]));
    }
  }

  async function handleLogout() {
    dispatch(clearActiveAccount());
    dispatch(setPinnedOwnerModules([]));
    void saveActiveAccount(null);
    dispatch(clearSession());
    dispatch(api.util.resetApiState());
    await clearStoredSession();
    router.replace("/auth");
  }

  const displayName = user?.fullName?.trim() || "Khatiyan user";
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [profileEdit, setProfileEdit] = useState<ProfileEditField | null>(null);
  const profileImageUri = pickedImageUri ?? profileQuery.data?.profilePhotoUrl ?? null;

  async function saveRecoveryEmail() {
    const email = emailDraft.trim();
    if (!form.validate(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? {} : { email: "Enter a valid recovery email address." })) {
      return;
    }
    try {
      await updateRecoveryEmail({ email }).unwrap();
      setEmailDraft("");
      toast.success("Email added. Verify it before using email sign-in or PIN reset.");
    } catch (error) {
      form.failFromServer(error instanceof Error ? error.message : "Unable to add recovery email.");
    }
  }

  async function sendVerificationLink() {
    // The server would reject this anyway, but a toast that names the problem
    // beats a generic failure — and the link is only reachable when an address
    // is on file, so this catches the race where it was just removed.
    if (!emailRecoveryQuery.data?.email?.trim()) {
      form.failFromServer("Add an email address first.");
      return;
    }
    if (requestEmailVerificationState.isLoading) {
      return;
    }
    try {
      await requestEmailVerification().unwrap();
      toast.success("Verification link sent to your email.");
    } catch (error) {
      form.failFromServer(error instanceof Error ? error.message : "Unable to send verification link.");
    }
  }
  /**
   * The name that rides along with any photo save.
   *
   * <p>`displayName` falls back to "Khatiyan user" so the header is never
   * blank; sending that to the API would rename someone as a side effect of
   * touching their photo, so the real value is used and its absence is an
   * error rather than a default.
   */
  function nameForPhotoSave() {
    return user?.fullName?.trim() ?? "";
  }

  /** Persists a photo change and keeps the cached session in step. */
  async function savePhoto(url: string, publicId: string | null) {
    const updated = await updateProfile({
      fullName: nameForPhotoSave(),
      profilePhotoPublicId: publicId,
      profilePhotoUrl: url,
    }).unwrap();

    // The avatar is read from the session on other screens, so this is what
    // makes the change show up everywhere rather than only after a sign-in.
    if (auth.accessToken) {
      const session = { accessToken: auth.accessToken, user: updated };
      dispatch(setSession(session));
      await saveSession(session);
    }
  }

  /**
   * Uploads a picked photo and saves it.
   *
   * <p>This used to end at {@code setPickedImageUri}: the photo was held in
   * component state and never uploaded or saved, so it survived until the next
   * navigation and existed on no other device. The picture appeared to change,
   * which is worse than the button doing nothing.
   */
  async function attachPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!nameForPhotoSave()) {
      form.failFromServer("Add your name before setting a photo.");
      return;
    }

    // Shown straight from the device file while the upload runs — otherwise the
    // avatar sits unchanged and the tap reads as having failed.
    setPickedImageUri(asset.uri);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadAsset(
        {
          mimeType: asset.mimeType,
          name: asset.fileName ?? "Profile photo",
          size: asset.fileSize,
          uri: asset.uri,
        },
        "PROFILE_PHOTO",
      );
      await savePhoto(uploaded.url, uploaded.publicId);
      // Drop the local preview so the stored URL is what renders from here on.
      setPickedImageUri(null);
      toast.success("Profile photo updated.");
    } catch (error) {
      setPickedImageUri(null);
      form.failFromServer(
        error instanceof Error && error.message ? error.message : "Could not update your photo. Try again.",
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function pickProfileImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      form.failFromServer("Allow photo library access to change your picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await attachPhoto(result.assets[0]);
    }
  }

  async function captureProfileImage() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      form.failFromServer("Allow camera access to take a picture.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await attachPhoto(result.assets[0]);
    }
  }

  /**
   * Clears the photo.
   *
   * <p>Blank, not null: the server reads null as "leave it alone" and blank as
   * "remove it", so null here would silently do nothing.
   */
  async function removeProfileImage() {
    if (!nameForPhotoSave()) {
      form.failFromServer("Add your name before changing your photo.");
      return;
    }
    setUploadingPhoto(true);
    try {
      await savePhoto("", "");
      setPickedImageUri(null);
      toast.success("Profile photo removed.");
    } catch (error) {
      form.failFromServer(
        error instanceof Error && error.message ? error.message : "Could not remove your photo. Try again.",
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        // eyebrow="Account"
        title={user?.activeTenant ? "Tenant" : "Your"}
        italicTail="profile."
        subtitle="Your identity, account access and saved details."
        trailing={<HeaderIconButton icon={Cog} label="Open settings" onPress={() => router.push("/account-settings")} />}
      />

      <View style={{ alignItems: "center", gap: spacing.md }}>
        <ProfileAvatar
          busy={uploadingPhoto}
          imageUri={profileImageUri}
          name={displayName}
          onEdit={() => setPhotoSheetOpen(true)}
          onView={() => setPhotoViewerOpen(true)}
        />
        <View style={{ alignItems: "center", gap: spacing.xxs }}>
          {/* The pencil sits beside the name rather than in a settings screen,
              because this is where the name is read. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.ink,
                fontFamily: fonts.sansBold,
                fontSize: 20,
                textAlign: "center",
              }}
            >
              {displayName}
            </Text>
            <AnimatedPressable
              accessibilityLabel="Edit name"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setProfileEdit("name")}
            >
              <Pencil color={colors.kicker} size={15} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {accessLabel}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Personal information" />
        <Card style={{ gap: spacing.sm, padding: spacing.md }}>
          <ReadonlyField label="Registered phone" value={user?.phone ?? "-"} />
          <ReadonlyField label="Workspace access" value={accessLabel} />
          <ReadonlyField label="Account standing" value={user?.active ? "Active" : "Inactive"} />
          <ReadonlyField
            label="Phone verification"
            value={user?.phoneVerified ? "Verified" : "Not verified yet"}
          />
          {emailRecoveryQuery.data?.email ? (
            // Verified reads as a state; unverified offers the action instead of
            // announcing itself. There is no "Unverified" label — a Verify link
            // says the same thing and does something about it.
            <ReadonlyField
              label="Email"
              onEdit={() => setProfileEdit("email")}
              onStatusPress={emailRecoveryQuery.data.verified ? undefined : () => void sendVerificationLink()}
              status={
                emailRecoveryQuery.data.verified
                  ? "Verified"
                  : requestEmailVerificationState.isLoading
                    ? "Sending…"
                    : "Verify"
              }
              value={emailRecoveryQuery.data.email}
            />
          ) : (
            <View style={{ gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.kicker }]}>Email</Text>
              <AppTextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(next) => {
                  setEmailDraft(next);
                  form.clearField("email");
                }}
                placeholder="Add your email"
                placeholderTextColor={colors.muted}
                value={emailDraft}
                style={{ backgroundColor: colors.surfaceRaised, borderColor: form.errors.email ? colors.danger : colors.border, borderRadius: 12, borderWidth: form.errors.email ? 1.5 : 1, color: colors.ink, fontFamily: fonts.sans, minHeight: 46, paddingHorizontal: spacing.md }}
              />
              <FieldError message={form.errors.email} />
              <ActionButton
                disabled={!emailDraft.trim() || updateRecoveryEmailState.isLoading || form.blocked}
                icon={MailCheck}
                label={updateRecoveryEmailState.isLoading ? "Adding email…" : "Add email"}
                onPress={() => void saveRecoveryEmail()}
                variant="secondary"
              />
            </View>
          )}
          <ReadonlyField label="Account reference" value={shortId(user?.id)} mono />
        </Card>
      </View>

      {/* Always rendered. Hiding it when there is only one account left people
          wondering whether switching exists at all; saying "one account" answers
          the question outright. */}
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Switch account" />
        {accounts.length > 1 ? (
          <View style={{ gap: spacing.sm }}>
            {accounts.map((account) => (
              <AccountRow account={account} active={account === activeAccount} key={account} onPress={() => switchAccount(account)} />
            ))}
          </View>
        ) : (
          <Card style={{ gap: spacing.xs, padding: spacing.md }}>
            <Text style={[type.caption, { color: colors.ink, fontWeight: "900" }]}>
              {activeAccount ? `${accountLabel(activeAccount)} account` : "Single account"}
            </Text>
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
              Only one account is registered on this number. Another appears here if you register a property or are added
              as a tenant or manager.
            </Text>
          </Card>
        )}
      </View>

      {accounts.includes("owner") ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="Registered properties" />
          <Card style={{ gap: spacing.sm, padding: spacing.md }}>
            <ReadonlyField
              label="Owner portfolio"
              value={
                ownerPropertiesQuery.isFetching
                  ? "Loading"
                  : `${ownerPropertyCount} registered propert${ownerPropertyCount === 1 ? "y" : "ies"}`
              }
            />
            {/* The one thing an owner comes to this section to DO, so it is a
                primary button rather than another row that looks like the
                read-only fields above it. */}
            <ActionButton
              icon={Plus}
              label="Register new property"
              onPress={() => router.push("/owner-register-property")}
            />
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
              Add a new PG, hostel or apartment and create its discovery profile.
            </Text>
          </Card>
        </View>
      ) : null}

      <AnimatedPressable
        onPress={handleLogout}
        style={{
          alignItems: "center",
          backgroundColor: colors.danger,
          borderCurve: "continuous",
          borderRadius: 14,
          flexDirection: "row",
          gap: spacing.sm,
          justifyContent: "center",
          minHeight: 52,
          padding: spacing.md,
        }}
      >
        <Power color={colors.onPrimary} size={17} strokeWidth={2.2} />
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 14, }}>
          Log out
        </Text>
      </AnimatedPressable>

      <ProfileEditModal
        busy={updateProfileState.isLoading || updateRecoveryEmailState.isLoading}
        field={profileEdit}
        initialValue={profileEdit === "email" ? (emailRecoveryQuery.data?.email ?? "") : (user?.fullName ?? "")}
        onClose={() => setProfileEdit(null)}
        onSave={async (nextValue) => {
          if (profileEdit === "email") {
            await updateRecoveryEmail({ email: nextValue }).unwrap();
            setProfileEdit(null);
            toast.success("Email updated. Verify it from the link we sent.");
            return;
          }

          const updated = await updateProfile({ fullName: nextValue }).unwrap();
          // Keep the cached session in step so the name changes everywhere
          // immediately rather than only after the next sign-in.
          if (auth.accessToken) {
            const session = { accessToken: auth.accessToken, user: updated };
            dispatch(setSession(session));
            await saveSession(session);
          }
          setProfileEdit(null);
          toast.success("Name updated.");
        }}
      />

      {/* The camera button opens this rather than jumping straight to the
          library. Removing a photo needs somewhere to live, and there was no
          second affordance on a single round button — and the account screen
          was the only picker in the app with no camera option. */}
      {photoSheetOpen ? (
        <SheetShell onClose={() => setPhotoSheetOpen(false)} title="Profile photo">
          <View style={{ gap: spacing.xs }}>
            <PhotoAction
              icon={ImageIcon}
              label="Choose from library"
              onPress={() => {
                setPhotoSheetOpen(false);
                void pickProfileImage();
              }}
            />
            <PhotoAction
              icon={Camera}
              label="Take a photo"
              onPress={() => {
                setPhotoSheetOpen(false);
                void captureProfileImage();
              }}
            />
            {/* Only when there is one — otherwise it is a button that does
                nothing to a set of initials. */}
            {profileImageUri ? (
              <PhotoAction
                destructive
                icon={Trash2}
                label="Remove photo"
                onPress={() => {
                  setPhotoSheetOpen(false);
                  setConfirmRemovePhoto(true);
                }}
              />
            ) : null}
          </View>
        </SheetShell>
      ) : null}

      {/* The same full-screen viewer the property and concern carousels use,
          given a one-item list. Its dashes hide below two images, so a single
          photo needs no separate component. */}
      {photoViewerOpen && profileImageUri ? (
        <Lightbox images={[profileImageUri]} initialIndex={0} onClose={() => setPhotoViewerOpen(false)} />
      ) : null}

      {/* Confirmed rather than removed on tap: it is one tap away inside a
          sheet someone may have opened only to replace the picture. */}
      {confirmRemovePhoto ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message="Your profile will show your initials instead."
          onCancel={() => setConfirmRemovePhoto(false)}
          onConfirm={() => {
            setConfirmRemovePhoto(false);
            void removeProfileImage();
          }}
          title="Remove profile photo?"
        />
      ) : null}
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}

    </ScreenScrollView>
  );
}

/**
 * One row in the profile-photo sheet.
 *
 * <p>Outlined, not filled. The app's filled-ink rows mean "selected" in the
 * pickers; these are actions, so filling one would read as already chosen.
 * The destructive row is marked by colour alone, which is enough to slow
 * someone down without turning the sheet into a warning.
 */
function PhotoAction({
  destructive,
  icon: Icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const tint = destructive ? colors.danger : colors.ink;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: destructive ? colors.danger : colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: 13,
      }}
    >
      <Icon color={tint} size={18} strokeWidth={2.1} />
      <Text style={{ color: tint, fontFamily: fonts.sansMedium, fontSize: 15 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ProfileAvatar({
  busy,
  imageUri,
  name,
  onEdit,
  onView,
}: {
  busy?: boolean;
  imageUri: string | null;
  name: string;
  onEdit: () => void;
  /** Opens the full-screen view. Only reachable when there is a photo. */
  onView: () => void;
}) {
  const { colors, fonts } = useTheme();
  const initials = initialsFor(name);
  // Pressable only when there is something to enlarge, and not mid-upload —
  // otherwise it is a button over a set of initials that does nothing, and the
  // viewer would open on a local file that is about to be replaced.
  const viewable = Boolean(imageUri) && !busy;
  // Sibling of the camera button, never its parent: on web both are <button>,
  // and nesting them is invalid HTML that also hides the inner one from
  // keyboard and screen readers.
  const Circle = viewable ? AnimatedPressable : View;

  return (
    <View style={{ height: 108, width: 108 }}>
      <Circle
        {...(viewable
          ? { accessibilityLabel: "View profile photo", accessibilityRole: "button" as const, onPress: onView }
          : {})}
        style={{
          alignItems: "center",
          borderColor: colors.border,
          borderRadius: 54,
          borderWidth: 1,
          height: 108,
          justifyContent: "center",
          overflow: "hidden",
          width: 108,
        }}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ height: 108, width: 108 }} />
        ) : (
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 40, letterSpacing: 0.5 }}>
            {initials}
          </Text>
        )}

        {/* Over the picture, not instead of it: the new photo is already
            showing from the device file, and swapping it for a spinner would
            hide the very thing the person just chose. */}
        {busy ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.overlay,
              bottom: 0,
              justifyContent: "center",
              left: 0,
              position: "absolute",
              right: 0,
              top: 0,
            }}
          >
            <ActivityIndicator color={colors.onPrimary} />
          </View>
        ) : null}
      </Circle>

      <AnimatedPressable
        accessibilityLabel="Change profile photo"
        accessibilityRole="button"
        disabled={busy}
        onPress={onEdit}
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderColor: colors.background,
          borderRadius: 18,
          borderWidth: 2,
          bottom: -2,
          height: 36,
          justifyContent: "center",
          position: "absolute",
          right: -2,
          width: 36,
        }}
      >
        <Camera color={colors.onPrimary} size={17} strokeWidth={2.2} />
      </AnimatedPressable>
    </View>
  );
}

/**
 * Section heading for this screen.
 *
 * <p>Delegates to the shared {@link Section} so the profile carries the same
 * kicker / serif title / ruled margin as every other screen. It used to draw a
 * lone terracotta line of bold sans, which was the only heading style in the
 * app that looked like this.
 */
function SectionTitle({ title }: { title: string }) {
  return <Section title={title} />;
}

/**
 * One stored fact about the account.
 *
 * <p>The label is a quiet kicker rather than heavy bold: in a stack of six
 * fields the labels are scaffolding and the values are the content, and the old
 * treatment weighted them the other way round. `status` renders inside the
 * field on the right — a fact about the value belongs with the value, not on a
 * button underneath it.
 *
 * <p>Weight comes from the font family. Asking for `fontWeight` on top of a
 * loaded family gets synthetic bolding on Android.
 */
function ReadonlyField({
  label,
  mono,
  onEdit,
  onStatusPress,
  status,
  value,
}: {
  label: string;
  mono?: boolean;
  /** Renders a pencil inside the field that opens the editor for this value. */
  onEdit?: () => void;
  /** Makes `status` a link — used for "Verify", which is an action, not a state. */
  onStatusPress?: () => void;
  status?: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[type.caption, { color: colors.kicker }]}>{label}</Text>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: colors.ink,
            flex: 1,
            fontFamily: mono ? fonts.mono : fonts.sansBold,
            fontSize: 15,
          }}
        >
          {value}
        </Text>
        {onEdit ? (
          <AnimatedPressable accessibilityLabel={`Edit ${label.toLowerCase()}`} accessibilityRole="button" hitSlop={10} onPress={onEdit}>
            <Pencil color={colors.kicker} size={15} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
        {/* A hairline and plain text, not a tinted chip. Inside a field the
            status qualifies the value beside it; a green pill made it read as a
            separate badge sitting in the box. */}
        {status ? (
          <>
            <View style={{ alignSelf: "stretch", backgroundColor: colors.border, marginVertical: spacing.sm, width: 1 }} />
            {onStatusPress ? (
              <AnimatedPressable accessibilityRole="button" hitSlop={8} onPress={onStatusPress}>
                <Text style={[type.caption, { color: colors.primary, fontFamily: fonts.sansBold }]}>{status}</Text>
              </AnimatedPressable>
            ) : (
              <Text style={[type.caption, { color: colors.muted }]}>{status}</Text>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
}

function AccountRow({ account, active, onPress }: { account: AccountType; active: boolean; onPress: () => void }) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const Icon = account === "owner" ? Building2 : account === "manager" ? ShieldCheck : Home;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: active ? colors.borderStrong : colors.border,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: active ? colors.ink : colors.surfaceRaised,
          borderRadius: 12,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        <Icon color={active ? colors.surface : colors.inkSoft} size={19} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 16, }}>
          {accountLabel(account)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {accountDescription(account)}
        </Text>
      </View>
      {active ? <Check color={colors.ink} size={20} strokeWidth={2.4} /> : <ChevronRight color={colors.kicker} size={20} strokeWidth={2.2} />}
    </AnimatedPressable>
  );
}

function HeaderIconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={{ alignItems: "center", height: 44, justifyContent: "center", width: 44 }}
    >
      <Icon color={colors.ink} size={22} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function accessLabelFor(role: string | undefined, activeTenant: boolean, managesAnyProperty: boolean) {
  if (role === "OWNER") {
    return "Owner";
  }
  if (managesAnyProperty) {
    return "Manager";
  }
  if (activeTenant) {
    return "Tenant";
  }
  return role ? humanizeToken(role) : "-";
}

function initialsFor(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "KH";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function shortId(value?: string) {
  if (!value) {
    return "-";
  }
  return value.slice(0, 8).toUpperCase();
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
