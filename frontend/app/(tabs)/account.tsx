import { useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { PropertyIcon } from "@/components/property-icon";
import { AppTextInput } from "@/components/app-text-input";
import { emailProblem } from "@/features/forms/email-validation";
import { GENDER_LABELS } from "@/features/account/gender-picker";
import * as ImagePicker from "expo-image-picker";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import {
  Camera,
  Check,
  ChevronRight,
  Cog,
  Home,
  Info,
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
import { Divider } from "@/components/divider";
import { SkeletonCard } from "@/components/skeleton";
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
import { useGetEmailRecoveryStatusQuery, useGetMyIdentityQuery, useGetProfileQuery, useRequestEmailVerificationMutation, useUpdateProfileMutation, useUpdateRecoveryEmailMutation, type UserIdentity } from "@/store/services/auth-api";
import { MAX_OWNER_PROPERTIES, useListMyPropertiesQuery } from "@/store/services/property-api";
import { clearActiveAccount, setActiveAccount } from "@/store/slices/account-slice";
import { clearSession, setSession } from "@/store/slices/auth-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** The pencil beside the profile name, and the spacer that balances it. */
const NAME_EDIT_SLOT = 15;

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
  const identityQuery = useGetMyIdentityQuery(undefined, { skip: !auth.accessToken });
  const identity = identityQuery.data;
  const profileCompletion = describeProfileCompletion(identity);
  const [updateRecoveryEmail, updateRecoveryEmailState] = useUpdateRecoveryEmailMutation();
  const [requestEmailVerification, requestEmailVerificationState] = useRequestEmailVerificationMutation();
  const [updateProfile, updateProfileState] = useUpdateProfileMutation();
  const user = profileQuery.data ?? auth.user;
  const { accounts, loading: accountsLoading } = useAvailableAccounts();
  const ownerPropertiesQuery = useListMyPropertiesQuery(undefined, { skip: !accounts.includes("owner") });
  const ownerPropertyCount = ownerPropertiesQuery.data?.length ?? 0;
  // The server refuses past this too — the button is the courtesy, not the gate.
  const atPropertyCap = ownerPropertyCount >= MAX_OWNER_PROPERTIES;
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
  const [completionInfoOpen, setCompletionInfoOpen] = useState(false);
  const profileImageUri = pickedImageUri ?? profileQuery.data?.profilePhotoUrl ?? null;

  async function saveRecoveryEmail() {
    const email = emailDraft.trim();
    const emailIssue = emailProblem(email, "Enter an email address.");
    if (!form.validate(emailIssue ? { email: emailIssue } : {})) {
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
    <ScreenScrollView
      safeAreaEdges={["top", "bottom"]}
      // The default in-tabs padding is 96, sized to clear the tab bar without a
      // safe-area edge. This screen has one, so the inset was being counted
      // twice and left a hand's width of nothing under the log out button. The
      // bar is 60 tall and the SafeAreaView already supplies the rest.
      contentContainerStyle={{ paddingBottom: 60 + spacing.md }}
    >
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
          {/* The NAME is centred, not the name-plus-pencil. A row that simply
              centres both puts the name off-centre by half the icon's width, so
              an empty slot the same size balances it on the left. The pencil then
              sits after the name without being part of what is centred. */}
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
            <View style={{ width: NAME_EDIT_SLOT }} />
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
              style={{ width: NAME_EDIT_SLOT }}
            >
              <Pencil color={colors.kicker} size={NAME_EDIT_SLOT} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {accessLabel}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Personal information" />
        <Card
          style={{
            // No negative margin. Pulling the card past the screen's content
            // column put its edge within a few points of the device edge, and no
            // amount of internal padding could buy back the gap that lost — the
            // card simply had nowhere to breathe. It now sits on the screen's own
            // gutter like every other card, with Card's default padding inside.
            borderRadius: 12,
            gap: spacing.md,
          }}
        >
          {/* Four short facts in a 2×2, above the two long ones. Each is a word
              or two, so a full-width row per fact left most of the line empty and
              pushed the phone and email — the fields anyone actually came here to
              read — below the fold. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {/* Account status, not workspace access — the access level is
                already stated under the name, and repeating it here spent one of
                four slots saying something the reader had just been told. */}
            <View style={{ flex: 1 }}>
              <ReadonlyField label="Account status" value={user?.active ? "Active" : "Inactive"} />
            </View>
            <View style={{ flex: 1 }}>
              <CompletionField
                complete={profileCompletion.complete}
                onExplain={() => setCompletionInfoOpen(true)}
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              {/* "Not set", not a dash. A dash reads as a value the field holds;
                  these are simply unanswered. */}
              <ReadonlyField
                label="Gender"
                value={identity?.gender ? GENDER_LABELS[identity.gender] : "Not set"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ReadonlyField
                label="Date of birth"
                value={identity?.dateOfBirth ? formatBirthDate(identity.dateOfBirth) : "Not set"}
              />
            </View>
          </View>

          {/* Verification sits INSIDE the phone field, as it does for email. It
              is a fact about that value, and as its own row it read as a separate
              thing to keep track of. */}
          {/* The flag and dial code as their own segment behind a divider —
              the same treatment the auth screen's PhoneField uses, so a number
              is presented the way it was asked for. */}
          <ReadonlyField
            label="Registered phone"
            prefix={<DialCodePrefix />}
            status={user?.phoneVerified ? "Verified" : "Not verified"}
            value={formatPhone(user?.phone)}
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
          {/* Always shown, unlike the optional two above. This one is REQUIRED to
              onboard a tenant, so a blank row is information — it is the field
              standing between an owner and their first agreement. */}
          <AddressField
            pincode={identity?.permanentAddressPincode ?? null}
            value={identity?.permanentAddress ?? null}
          />

          <ReadonlyField label="Account reference" value={shortId(user?.id)} mono />
        </Card>
      </View>

      {/* Always rendered. Hiding it when there is only one account left people
          wondering whether switching exists at all; saying "one account" answers
          the question outright. */}
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Switch account" />
        {/* The same row either way, so the one account you have looks like an
            account rather than like a paragraph explaining that you have one.
            With nothing to switch to it is simply the only option, already
            ticked, and the line under it says why there is no second. */}
        <View style={{ gap: spacing.sm }}>
          {accounts.map((account) => (
            <AccountRow account={account} active={account === activeAccount} key={account} onPress={() => switchAccount(account)} />
          ))}
        </View>
        {accounts.length > 1 ? null : (
          <Text style={[type.caption, { color: colors.muted }]}>
            Only one account available for this phone.
          </Text>
        )}
      </View>

      {accounts.includes("owner") ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle
            title="Registered properties"
            trailing={
              ownerPropertiesQuery.isFetching && ownerPropertyCount === 0 ? null : (
                <Text
                  style={[
                    type.caption,
                    // Amber at the cap: it is not an error — four properties is
                    // a full allowance, not a fault — but it is the moment the
                    // number starts meaning something.
                    { color: atPropertyCap ? colors.accent : colors.muted, fontWeight: "700" },
                  ]}
                >
                  {ownerPropertyCount}/{MAX_OWNER_PROPERTIES}
                </Text>
              )
            }
          />
          {/* The properties themselves, not a count of them. "3 registered
              properties" is a number an owner already knows; which three is the
              thing they came to check. */}
          {/* One card, ruled between entries — a portfolio is a list, and a card
              per property made three properties look like three unrelated
              things. The place sits opposite its name rather than under it, so
              the eye can run down either column on its own. */}
          {ownerPropertiesQuery.isFetching && ownerPropertyCount === 0 ? (
            <SkeletonCard />
          ) : ownerPropertyCount === 0 ? null : (
            <Card style={{ gap: 0, padding: 0 }}>
              {ownerPropertiesQuery.data?.map((property, index) => (
                <View key={property.id}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: spacing.sm,
                      justifyContent: "space-between",
                      padding: spacing.md,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 15 }}
                    >
                      {property.name}
                    </Text>
                    <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                      {[property.state, "India"].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {/* The one thing an owner comes to this section to DO, so it is a
              primary button rather than another row that looks like the cards
              above it. */}
          <ActionButton
            disabled={atPropertyCap}
            icon={Plus}
            label="Register new property"
            onPress={() => router.push("/owner-register-property")}
          />
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            {atPropertyCap
              ? `You are using all ${MAX_OWNER_PROPERTIES} of your property slots. Deactivate one from its property screen to register another.`
              : "Add a new PG, hostel or apartment and create its discovery profile."}
          </Text>
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
      {/* The detail behind "Incomplete". It lives here rather than in the field
          because there is room for a sentence, and because what is missing is
          only worth reading once — the field's job is to say that something is. */}
      {completionInfoOpen ? (
        <ConfirmDialog
          acknowledgeOnly
          bullets={profileCompletion.missing}
          confirmLabel="Got it"
          message="Add these in Settings before onboarding a tenant. An agreement names you as the Landlord, so it needs them."
          onCancel={() => setCompletionInfoOpen(false)}
          onConfirm={() => setCompletionInfoOpen(false)}
          title="Profile incomplete"
        />
      ) : null}

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
function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return <Section title={title} trailing={trailing} />;
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
  prefix,
  status,
  value,
}: {
  label: string;
  mono?: boolean;
  /** Renders a pencil inside the field that opens the editor for this value. */
  onEdit?: () => void;
  /** Makes `status` a link — used for "Verify", which is an action, not a state. */
  onStatusPress?: () => void;
  /** An adornment before the value — the phone's flag and dial code. */
  prefix?: ReactNode;
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
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        {prefix}
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
  const Icon = account === "owner" ? PropertyIcon : account === "manager" ? ShieldCheck : Home;
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
      {/* Words, not a tick. A check mark beside the only row on the list reads
          as a control you could untick; "This account" states which one you are
          in, which is the actual question. Jade because that is the app's
          selection colour everywhere else — the tabs, the amenity boxes, the
          room type ticks. */}
      {active ? (
        <Text style={[type.caption, { color: colors.jade, fontWeight: "700" }]}>This account</Text>
      ) : (
        <ChevronRight color={colors.kicker} size={20} strokeWidth={2.2} />
      )}
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

/**
 * A stored ISO date as dd/mm/yyyy.
 *
 * <p>Numeric, not "4 February 2004". A birth date is a value copied off an ID
 * and checked against one, so it reads the way it is printed there — and the
 * spelled-out month wrapped this field on a narrow screen while the two beside
 * it stayed on one line.
 *
 * <p>Built from the date parts by hand rather than through `toLocaleDateString`,
 * because the locale decides the ORDER: an en-IN device gives dd/mm/yyyy but the
 * same code on an en-US one silently reads back 02/04/2004 as 4 February. A date
 * of birth is not a field to leave to a device setting.
 */
function formatBirthDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  // Local parts, not the UTC ones. `toISOString` shifts the day backwards in
  // IST for anything before 05:30, which would age everybody by a day.
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${parsed.getFullYear()}`;
}

/**
 * How complete this profile is, and what is missing.
 *
 * <p>Computed from the same three facts the server gates onboarding on — a name,
 * a VERIFIED email, and a permanent address — rather than from the stored
 * `profileCompleted` flag, which only tracks whether a name was ever saved. A
 * status that said "Complete" while onboarding refused the same account would be
 * worse than showing nothing.
 *
 * <p>Date of birth and gender are deliberately excluded. They are optional, the
 * deed omits them when blank, and counting them would leave every profile
 * permanently short of complete for no reason anyone could act on.
 *
 * <p>One missing item is NAMED, because there is a single thing to go and do.
 * Several are counted, because listing three fixes in a two-word field would
 * truncate to something unreadable.
 */
function describeProfileCompletion(identity: UserIdentity | undefined) {
  // Nothing loaded yet is not the same as incomplete. Reporting a problem before
  // the answer has arrived would flash red on every open.
  if (!identity) {
    return { complete: true, missing: [] as string[] };
  }

  const missing: string[] = [];
  if (!identity.fullName?.trim()) {
    missing.push("Your full name");
  }
  if (!identity.email?.trim()) {
    missing.push("An email address");
  } else if (!identity.emailVerified) {
    missing.push("Verification of your email address");
  }
  if (!identity.permanentAddress?.trim() || !identity.permanentAddressPincode?.trim()) {
    missing.push("Your permanent address and PIN code");
  }

  return { complete: missing.length === 0, missing };
}

/**
 * Profile completion, as a state rather than a list.
 *
 * <p>The field says "Complete" or "Incomplete" and nothing else. Naming the
 * missing item inline meant a half-width field carrying "2 details missing" or a
 * truncated "Add email verificat…", which is a worse answer to "is my profile
 * done" than one word — and the detail belongs where there is room for it.
 *
 * <p>Red only when incomplete. There is something to go and do; a neutral colour
 * on the one field with an outstanding action buries it among eight facts that
 * need nothing.
 */
function CompletionField({ complete, onExplain }: { complete: boolean; onExplain: () => void }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
        <Text style={[type.caption, { color: colors.kicker }]}>Profile completion</Text>
        {/* Only when there is something to explain. An info icon beside a
            finished state invites a tap that says "nothing to do". */}
        {complete ? null : (
          <AnimatedPressable
            accessibilityLabel="What is missing from my profile"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onExplain}
          >
            <Info color={colors.muted} size={13} strokeWidth={2.4} />
          </AnimatedPressable>
        )}
      </View>

      {/* The same box every other field on this card uses. Rendered as bare text
          it was the one value floating outside a field, which read as a caption
          rather than as a fact the account holds. */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: 12,
          borderWidth: 1,
          flexDirection: "row",
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: complete ? colors.ink : colors.danger,
            flex: 1,
            fontFamily: fonts.sansBold,
            fontSize: 15,
          }}
        >
          {complete ? "Complete" : "Incomplete"}
        </Text>
      </View>
    </View>
  );
}

/**
 * The permanent address, given room to be one.
 *
 * <p>A one-line field truncated a real address to "14B Hazra Road, Bhow…", which
 * is the field on this card most likely to need checking against a document. It
 * gets its own block, wraps, and shows the PIN on its own line.
 */
function AddressField({ pincode, value }: { pincode: string | null; value: string | null }) {
  const { colors, fonts, type } = useTheme();
  const held = Boolean(value?.trim());

  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[type.caption, { color: colors.kicker }]}>Permanent address</Text>
      {/* Deliberately BIGGER than the other fields, not matched to them. An
          address is the one value here that runs to several lines, and a 48pt
          box shared with every one-word fact truncated the field most likely to
          be checked against a document. */}
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderCurve: "continuous",
          borderRadius: 8,
          gap: 2,
          minHeight: 84,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        <Text
          style={{
            color: held ? colors.ink : colors.muted,
            fontFamily: held ? fonts.sansMedium : fonts.sans,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {held ? value : "Not set — needed before you can onboard a tenant"}
        </Text>
        {held && pincode?.trim() ? (
          <Text style={[type.caption, { color: colors.muted }]}>PIN {pincode}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A stored phone number, shown the way the app asks for one.
 *
 * <p>Prefixed "+91" and grouped, matching the auth field's flag-and-dial-code
 * treatment. The stored value may or may not already carry the country code —
 * the server accepts both forms — so this takes the last ten digits rather than
 * trusting either shape, and a number that is not ten digits is shown as-is
 * rather than mangled into a wrong one.
 */
function formatPhone(phone: string | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) {
    return phone?.trim() || "-";
  }
  const local = digits.slice(-10);
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/**
 * The flag and "+91", set apart by a hairline.
 *
 * <p>Copied in spirit from the auth screen's `PhoneField`: the dial code is part
 * of the number, so it sits in the same box, and the rule between them keeps the
 * two halves legible without reading as a second field.
 */
function DialCodePrefix() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Text style={{ fontSize: 16 }}>{String.fromCodePoint(0x1f1ee, 0x1f1f3)}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>+91</Text>
      <View
        style={{
          backgroundColor: colors.borderStrong,
          height: 20,
          marginLeft: spacing.xs,
          width: 1,
        }}
      />
    </View>
  );
}
