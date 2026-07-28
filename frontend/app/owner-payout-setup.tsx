import { useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Check, Info, Landmark, Mail, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ActionButton, ConfirmDialog, FormInput, IconButton } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { useGetEmailRecoveryStatusQuery, useRequestEmailVerificationMutation } from "@/store/services/auth-api";
import {
  MAX_PAYOUT_ACCOUNTS,
  useAddPayoutAccountMutation,
  useDeletePayoutAccountMutation,
  useListPayoutAccountsQuery,
  useLookupIfscQuery,
  useSetPrimaryPayoutAccountMutation,
  useUpdatePayoutAccountMutation,
  type PayoutAccount,
  type SetupPayoutPayload,
} from "@/store/services/payout-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Which sheet is open. Editing tracks the account by id so the sheet keeps
// showing live data if the list refetches underneath it.
type FormTarget = { mode: "add" } | { mode: "edit"; id: string };

export default function OwnerPayoutAccountsScreen() {
  const router = useGuardedRouter();
  const toast = useToast();
  const { colors, type } = useTheme();

  // On a cold start the session is restored from storage asynchronously, so
  // firing before the token lands returns 403 and RTK Query caches the failure.
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const accountsQuery = useListPayoutAccountsQuery(undefined, { skip: !accessToken });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);

  const [addAccount, addState] = useAddPayoutAccountMutation();
  const [updateAccount, updateState] = useUpdatePayoutAccountMutation();
  const [deleteAccount] = useDeletePayoutAccountMutation();
  const [setPrimary] = useSetPrimaryPayoutAccountMutation();

  // Razorpay needs a contactable address on the payout account, and an owner who
  // signed up as a tenant reaches this screen with an unclaimed one. The server
  // refuses either way; gating here explains why instead of failing on submit.
  const emailQuery = useGetEmailRecoveryStatusQuery(undefined, { skip: !accessToken });
  const emailStatus = emailQuery.data;
  const emailReady = Boolean(emailStatus?.email) && Boolean(emailStatus?.verified);

  const detailAccount = accounts.find((account) => account.id === detailId) ?? null;
  const deleteAccountTarget = accounts.find((account) => account.id === deleteId) ?? null;
  const editingAccount =
    formTarget?.mode === "edit" ? (accounts.find((account) => account.id === formTarget.id) ?? null) : null;
  const atCapacity = accounts.length >= MAX_PAYOUT_ACCOUNTS;

  async function makePrimary(account: PayoutAccount) {
    if (account.primary) {
      toast.info("Rent already goes to this bank.");
      return;
    }
    try {
      await setPrimary(account.id).unwrap();
      toast.success(`Rent will now be sent to A/C ••••${account.accountNumberLast4}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function submitForm(payload: SetupPayoutPayload) {
    if (formTarget?.mode === "edit") {
      await updateAccount({ id: formTarget.id, payload }).unwrap();
      toast.success("Bank details updated.");
    } else {
      await addAccount(payload).unwrap();
      toast.success("Bank account added.");
    }
    setFormTarget(null);
  }

  async function confirmDelete() {
    if (!deleteAccountTarget) {
      return;
    }
    const target = deleteAccountTarget;
    setDeleteId(null);
    setDetailId(null);
    try {
      await deleteAccount(target.id).unwrap();
      toast.success("Bank account removed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ flexGrow: 1, paddingTop: 0 }}>
      <ScreenHeader
        onBack={() => router.back()}
        eyebrow="Payments"
        title="Bank"
        italicTail="accounts."
        subtitle="Rent collected in the app is deposited into the bank marked active. Khatiyan's fee is netted out before the transfer."
      />

      <Section title="Your banks" trailing={<InfoButton onPress={() => setSecurityOpen(true)} />}>
        {accountsQuery.isUninitialized || accountsQuery.isLoading ? (
          <View style={{ gap: spacing.sm }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : accountsQuery.isError ? (
          // Never fall through to the empty state on a failed load: telling an
          // owner they have no bank when we simply couldn't fetch invites them
          // to add a duplicate.
          <EmptyState
            action={<ActionButton icon={RefreshCw} label="Try again" onPress={() => void accountsQuery.refetch()} variant="secondary" />}
            icon={TriangleAlert}
            eyebrow="Couldn't load"
            title="Bank accounts unavailable"
            description="We couldn't reach the server to load your banks. Check your connection and try again."
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            eyebrow="Not set up"
            title="No bank account yet"
            description="Add the bank account where you want rent deposited. Until then, online rent collection stays off for your properties."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {accounts.map((account) => (
              <BankCard
                account={account}
                key={account.id}
                onOpen={() => setDetailId(account.id)}
                onTogglePrimary={() => void makePrimary(account)}
              />
            ))}
          </View>
        )}
      </Section>

      {/* Pinned to the foot of the screen: the list above grows into the space,
          so the primary action sits where the thumb is regardless of count. */}
      <View style={{ gap: spacing.sm, marginTop: "auto" }}>
        {emailReady ? (
          <ActionButton
            disabled={atCapacity}
            icon={Plus}
            label="Add new bank"
            onPress={() => setFormTarget({ mode: "add" })}
          />
        ) : (
          <EmailGate email={emailStatus?.email ?? null} />
        )}
        <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]} selectable>
          {emailReady
            ? "Manage up to two bank accounts for your property."
            : "Our payment partner sends payout updates to your email, so it has to be verified first."}
        </Text>
      </View>

      {securityOpen ? <SecurityModal onClose={() => setSecurityOpen(false)} /> : null}

      {detailAccount ? (
        <BankDetailModal
          account={detailAccount}
          onClose={() => setDetailId(null)}
          onDelete={() => setDeleteId(detailAccount.id)}
          onEdit={() => {
            setDetailId(null);
            setFormTarget({ mode: "edit", id: detailAccount.id });
          }}
        />
      ) : null}

      {formTarget ? (
        <BankFormSheet
          account={editingAccount}
          onClose={() => setFormTarget(null)}
          onSubmit={submitForm}
          saving={addState.isLoading || updateState.isLoading}
        />
      ) : null}

      {deleteAccountTarget ? (
        <ConfirmDialog
          confirmLabel="Remove bank"
          destructive
          message={
            deleteAccountTarget.primary && accounts.length > 1
              ? `A/C ••••${deleteAccountTarget.accountNumberLast4} is receiving rent right now. Remove it and your other bank takes over.`
              : `Remove A/C ••••${deleteAccountTarget.accountNumberLast4}? You'll need the full account number again to add it back.`
          }
          onCancel={() => setDeleteId(null)}
          onConfirm={() => void confirmDelete()}
          title="Remove bank account"
        />
      ) : null}
    </ScreenScrollView>
  );
}

// A bank on file. The circle toggles which account receives money; tapping
// anywhere else opens the detail modal where it can be edited or removed.
function BankCard({
  account,
  onOpen,
  onTogglePrimary,
}: {
  account: PayoutAccount;
  onOpen: () => void;
  onTogglePrimary: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const badge = statusBadge(account);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onOpen}
      style={{
        // The active bank is tinted, not just outlined — at a glance the card
        // itself answers "where is my rent going" without reading the pill.
        backgroundColor: account.primary ? colors.primarySoft : colors.surface,
        borderColor: account.primary ? colors.primary : colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: 20,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.lg,
      }}
    >
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: account.primary ? colors.surface : colors.primarySoft,
              borderColor: account.primary ? colors.primary : "transparent",
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1,
              height: 44,
              justifyContent: "center",
              width: 44,
            }}
          >
            <Landmark color={colors.primary} size={21} strokeWidth={2} />
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 17, fontWeight: "600" }}
              selectable
            >
              {account.bankName ?? "Bank account"}
            </Text>
            {account.branchName ? (
              <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]} selectable>
                {account.branchName}
              </Text>
            ) : null}
          </View>

          <PrimaryToggle onPress={onTogglePrimary} selected={account.primary} />
        </View>

        <View style={{ backgroundColor: colors.border, height: 1, opacity: 0.9 }} />

        {/* Equal thirds, anchored left / centre / right so the three facts read
            as a row of columns instead of bunching against the right edge. */}
        <View style={{ alignItems: "flex-end", flexDirection: "row", gap: spacing.sm }}>
          <FactColumn label="Holder" style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" }}
              selectable
            >
              {account.accountHolderName}
            </Text>
          </FactColumn>

          <FactColumn align="center" label="Account" style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.ink,
                fontFamily: fonts.sans,
                fontSize: 14,
                fontVariant: ["tabular-nums"],
                fontWeight: "700",
                letterSpacing: 1.4,
              }}
              selectable
            >
              •••• {account.accountNumberLast4}
            </Text>
          </FactColumn>

          {/* The card gets the short form so three columns fit a phone; the
              detail modal spells the status out in full. */}
          <FactColumn align="flex-end" label="Status" style={{ flex: 1 }}>
            <StatusPill label={badge.shortLabel} style={{ alignSelf: "flex-end" }} tone={badge.tone} />
          </FactColumn>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function FactColumn({
  align = "flex-start",
  children,
  label,
  style,
}: {
  align?: "flex-start" | "center" | "flex-end";
  children: ReactNode;
  label: string;
  style?: ViewStyle;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={[{ alignItems: align, gap: 5 }, style]}>
      <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 9.5 }]} selectable>
        {label}
      </Text>
      {children}
    </View>
  );
}

const IFSC_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const PAN_PATTERN = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

// Confirms the branch actually exists and names it back to the owner while they
// type. The query only fires once the code is well-formed, which doubles as the
// debounce — no request goes out mid-word.
function IfscBranchNote({ ifsc }: { ifsc: string }) {
  const { colors, type } = useTheme();
  const code = ifsc.trim().toUpperCase();
  const wellFormed = IFSC_PATTERN.test(code);
  const lookup = useLookupIfscQuery(code, { skip: !wellFormed });

  if (!wellFormed) {
    return null;
  }
  if (lookup.isFetching) {
    return (
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        Checking branch…
      </Text>
    );
  }
  if (lookup.data?.status === "FOUND") {
    return (
      <Text style={[type.caption, { color: colors.successText, fontWeight: "700" }]} selectable>
        {[lookup.data.bank, lookup.data.branch].filter(Boolean).join(" · ")}
      </Text>
    );
  }
  if (lookup.data?.status === "NOT_FOUND") {
    return (
      <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
        No bank branch uses this IFSC. Check your cheque book or passbook.
      </Text>
    );
  }
  // UNAVAILABLE or a failed request: stay quiet rather than imply the code is
  // wrong. The server applies the same rule when the form is submitted.
  return null;
}

// Replaces the "Add new bank" button until the owner's email is verified.
// Offers the fix inline rather than sending them away to find it: an owner who
// came here to get paid should not have to go hunting through settings.
function EmailGate({ email }: { email: string | null }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [requestVerification, requestState] = useRequestEmailVerificationMutation();
  const router = useGuardedRouter();

  async function sendLink() {
    try {
      await requestVerification().unwrap();
      toast.success(`Verification link sent to ${email}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (!email) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.caption, { color: colors.warningText, fontWeight: "700", textAlign: "center" }]} selectable>
          Add an email address to your account first.
        </Text>
        <ActionButton icon={Mail} label="Add email" onPress={() => router.push("/account-settings")} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.caption, { color: colors.warningText, fontWeight: "700", textAlign: "center" }]} selectable>
        Verify {email} to add a bank account.
      </Text>
      <ActionButton
        disabled={requestState.isLoading}
        icon={Mail}
        label={requestState.isLoading ? "Sending…" : "Send verification link"}
        onPress={() => void sendLink()}
      />
    </View>
  );
}

// Info affordance beside the section header. The security note used to occupy a
// whole card at the foot of the screen for something most owners read once.
function InfoButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="How your bank details are protected"
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderRadius: 999,
        borderWidth: 1,
        height: 30,
        justifyContent: "center",
        width: 30,
      }}
    >
      <Info color={colors.kicker} size={15} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function SecurityModal({ onClose }: { onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ alignItems: "center", flexDirection: "row", flex: 1, gap: spacing.sm }}>
              <ShieldCheck color={colors.successText} size={20} strokeWidth={2.2} />
              <Text
                numberOfLines={1}
                style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 20, fontWeight: "600" }}
                selectable
              >
                Your details are safe
              </Text>
            </View>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            We never store your full account number — only the last 4 digits and the IFSC. The full number is sent
            securely to our payment partner when you add the bank, and discarded straight after.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// Circle checkbox that picks the account rent is transferred to. It is a
// selection, not an on/off switch: one account is always active, so tapping the
// selected one changes nothing.
function PrimaryToggle({ onPress, selected }: { onPress: () => void; selected: boolean }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Receive rent in this account"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      hitSlop={10}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.primary : "transparent",
        borderColor: selected ? colors.primary : colors.borderStrong,
        borderRadius: 999,
        borderWidth: 2,
        height: 26,
        justifyContent: "center",
        width: 26,
      }}
    >
      {selected ? <Check color={colors.onPrimary} size={15} strokeWidth={3} /> : null}
    </AnimatedPressable>
  );
}

function BankDetailModal({
  account,
  onClose,
  onDelete,
  onEdit,
}: {
  account: PayoutAccount;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const badge = statusBadge(account);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }}
              selectable
            >
              {account.accountHolderName}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>

          <View style={{ flexDirection: "row" }}>
            <StatusPill label={badge.label} tone={badge.tone} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <DetailLine label="Account number" value={`••••${account.accountNumberLast4}`} />
            <DetailLine label="IFSC" value={account.ifsc} />
            {/* Always shown: a bank saved before PAN was collected needs the
                owner to notice it's missing, not to have the row hidden. */}
            <DetailLine label="PAN" value={account.pan ?? "Not provided"} />
            <DetailLine label="Receives rent" value={account.primary ? "Yes" : "No"} />
          </View>

          <Text style={[type.caption, { color: account.failureReason ? colors.danger : colors.muted }]} selectable>
            {account.failureReason ?? badge.hint}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton icon={Pencil} label="Edit" onPress={onEdit} variant="secondary" />
            <ActionButton icon={Trash2} label="Delete" onPress={onDelete} variant="danger" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ color: colors.ink, flexShrink: 1, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" }}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

// Bottom sheet for adding a bank or re-submitting details for an existing one.
// Expo 56 Android is edge-to-edge, where adjustResize no longer resizes the
// modal window — KeyboardAvoidingView with "padding" is what lifts the sheet
// above the keyboard on BOTH platforms, and the bottom inset is measured inside
// the modal so the button clears the nav bar.
function BankFormSheet({
  account,
  onClose,
  onSubmit,
  saving,
}: {
  account: PayoutAccount | null;
  onClose: () => void;
  onSubmit: (payload: SetupPayoutPayload) => Promise<void>;
  saving: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const [name, setName] = useState(account?.accountHolderName ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState(account?.ifsc ?? "");
  const [pan, setPan] = useState(account?.pan ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      return setError("Enter the account holder's name.");
    }
    if (!/^\d{9,18}$/.test(accountNumber.trim())) {
      return setError("Enter a valid bank account number.");
    }
    if (accountNumber.trim() !== confirmAccountNumber.trim()) {
      return setError("Account numbers don't match.");
    }
    if (!IFSC_PATTERN.test(ifsc.trim())) {
      return setError("Enter a valid IFSC code.");
    }
    if (!PAN_PATTERN.test(pan.trim())) {
      return setError("Enter a valid PAN, e.g. ABCDE1234F.");
    }
    try {
      await onSubmit({
        accountHolderName: name.trim(),
        accountNumber: accountNumber.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        pan: pan.trim().toUpperCase(),
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "space-between",
                marginBottom: spacing.md,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }}
                selectable
              >
                {account ? "Edit bank details" : "New bank account"}
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              {account ? (
                <Text style={[type.caption, { color: colors.muted }]} selectable>
                  We only keep the last 4 digits, so re-enter the full account number to save changes.
                </Text>
              ) : null}
              <FormInput
                label="Account holder name"
                onChangeText={(text) => {
                  setName(text);
                  setError(null);
                }}
                placeholder="As per bank records"
                value={name}
              />
              <FormInput
                keyboardType="number-pad"
                label="Account number"
                onChangeText={(text) => {
                  setAccountNumber(text);
                  setError(null);
                }}
                placeholder="Bank account number"
                value={accountNumber}
              />
              <FormInput
                keyboardType="number-pad"
                label="Confirm account number"
                onChangeText={(text) => {
                  setConfirmAccountNumber(text);
                  setError(null);
                }}
                placeholder="Re-enter account number"
                value={confirmAccountNumber}
              />
              <View style={{ gap: spacing.xs }}>
                <FormInput
                  autoCapitalize="characters"
                  label="IFSC"
                  onChangeText={(text) => {
                    setIfsc(text);
                    setError(null);
                  }}
                  placeholder="e.g. HDFC0001234"
                  value={ifsc}
                />
                <IfscBranchNote ifsc={ifsc} />
              </View>
              <FormInput
                autoCapitalize="characters"
                label="PAN"
                maxLength={10}
                onChangeText={(text) => {
                  setPan(text);
                  setError(null);
                }}
                placeholder="e.g. ABCDE1234F"
                value={pan}
              />
              <Text style={[type.caption, { color: colors.muted }]} selectable>
                Your bank needs the PAN of the account holder to verify the account, and tax withheld on rent is
                reported against it.
              </Text>
              {error ? (
                <Text style={[type.caption, { color: colors.danger, fontWeight: "700" }]} selectable>
                  {error}
                </Text>
              ) : null}
              <ActionButton
                disabled={saving}
                icon={Landmark}
                label={saving ? "Saving…" : account ? "Save changes" : "Add bank account"}
                onPress={() => void submit()}
              />
            </ScrollView>
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// `label` is the full wording used in the detail modal; `shortLabel` is what
// fits the card's three-column fact row on a phone.
function statusBadge(account: PayoutAccount): {
  hint: string;
  label: string;
  shortLabel: string;
  tone: "success" | "warning" | "neutral" | "danger";
} {
  if (account.status === "FAILED") {
    return {
      hint: "Fix the details and save again to retry verification.",
      label: "Verification failed",
      shortLabel: "Failed",
      tone: "danger",
    };
  }
  if (account.status === "PENDING") {
    return {
      hint: "We're activating this account with our payment partner. Online rent collection turns on once it's active.",
      label: "Activation pending",
      shortLabel: "Pending",
      tone: "warning",
    };
  }
  if (account.primary) {
    return {
      hint: "Rent collected in the app is deposited here automatically.",
      label: "Receiving rent",
      shortLabel: "Active",
      tone: "success",
    };
  }
  return {
    hint: "Verified and on file. Select it to start receiving rent here.",
    label: "On file",
    shortLabel: "On file",
    tone: "neutral",
  };
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { message?: string } }).data;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  }
  return "Something went wrong. Please try again.";
}
