import { useState } from "react";
import { Text, View } from "react-native";
import { ChevronDown, Filter, Plus, Trash2 } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput } from "@/features/owner/owner-ui";
import {
  useCreateExpenseCategoryMutation,
  useDeactivateExpenseCategoryMutation,
  type ExpenseCategory,
} from "@/store/services/expense-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Pick an expense category, or manage the list, from one control.
 *
 * <p>Modelled on the staff-category picker so the two read the same. Both are
 * owner-authored taxonomies attached to a property, and there was no reason for
 * one to be a sheet and the other a wrap of chips with a permanent text box
 * underneath.
 *
 * <p>The chip wrap was the actual problem: categories are owner-created and grow
 * without limit, so at a dozen it became four ragged rows sitting above the
 * fields it belonged to.
 *
 * <p>Creating and deleting live INSIDE the sheet. On the form they competed with
 * the expense being entered; behind the picker they are exactly where someone
 * already is when they find the category they want does not exist.
 */
export function ExpenseCategoryPicker({
  categories,
  error,
  onChange,
  propertyId,
  value,
}: {
  categories: ExpenseCategory[];
  error?: string;
  onChange: (categoryId: string) => void;
  propertyId: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategory | null>(null);
  const [deactivateCategory] = useDeactivateExpenseCategoryMutation();
  const opErrors = useFormErrors<never>();

  const selected = categories.find((category) => category.id === value);

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) {
      return;
    }
    try {
      await deactivateCategory({ categoryId: target.id, propertyId }).unwrap();
      // Clear the field if the deleted one was chosen, or the form would submit
      // an id the server has just retired.
      if (target.id === value) {
        onChange("");
      }
      toast.success(`${target.name} category deleted.`);
    } catch (caught) {
      opErrors.failFromServer(
        errorMessage(caught) || `"${target.name}" is still in use, so it cannot be deleted.`,
      );
    }
  }

  return (
    <View style={{ gap: 6 }}>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.border,
          borderRadius: 14,
          borderWidth: error ? 1.5 : 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Filter color={error ? colors.danger : colors.kicker} size={16} strokeWidth={2.2} />
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: error ? colors.danger : colors.kicker }]}>
            Category
          </Text>
          <Text style={[type.bodyStrong, { color: selected ? colors.ink : colors.muted }]} numberOfLines={1}>
            {selected?.name ?? "Choose a category"}
          </Text>
        </View>
        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </AnimatedPressable>
      <FieldError message={error} />

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title="Category">
          <View style={{ gap: spacing.xs }}>
            {categories.map((category) => (
              <CategoryRow
                active={category.id === value}
                key={category.id}
                label={category.name}
                // System categories are seeded and written into automatically —
                // a deposit payout posts to one — so they are not the owner's to
                // remove.
                onDelete={category.system ? undefined : () => setPendingDelete(category)}
                onPress={() => {
                  onChange(category.id);
                  setOpen(false);
                }}
              />
            ))}

            <ActionButton
              icon={Plus}
              label="New category"
              onPress={() => {
                // The picker closes first. Two sheets stacked is two native
                // windows, and the one underneath shows through the gaps.
                setOpen(false);
                setCreating(true);
              }}
              variant="secondary"
            />
          </View>
        </SheetShell>
      ) : null}

      {creating ? (
        <CreateCategoryModal
          onClose={() => setCreating(false)}
          onCreated={(categoryId) => {
            setCreating(false);
            // Selected straight away: someone who just typed a category name
            // wants to use it, not reopen the picker and hunt for it.
            onChange(categoryId);
          }}
          propertyId={propertyId}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Delete"
          destructive
          message={`Delete the "${pendingDelete.name}" category? This only works if no expenses use it.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
          title="Delete category?"
        />
      ) : null}

      {opErrors.serverError ? (
        <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} />
      ) : null}
    </View>
  );
}

/**
 * Creating a category, in its own sheet.
 *
 * <p>Matches the staff flow. Inline in the picker it was a text field competing
 * with the list it sat under, and the picker had to stay open behind a keyboard
 * to use it.
 */
function CreateCategoryModal({
  onClose,
  onCreated,
  propertyId,
}: {
  onClose: () => void;
  onCreated: (categoryId: string) => void;
  propertyId: string;
}) {
  const [name, setName] = useState("");
  const [createCategory, state] = useCreateExpenseCategoryMutation();
  const fieldErrors = useFormErrors<"name">();

  async function submit() {
    if (!fieldErrors.validate(name.trim() ? {} : { name: "Enter a category name." })) {
      return;
    }
    try {
      const created = await createCategory({ name: name.trim(), propertyId }).unwrap();
      onCreated(created.id);
    } catch (caught) {
      fieldErrors.failFromServer(errorMessage(caught) || "Could not create the category.");
    }
  }

  return (
    <SheetShell onClose={onClose} title="New expense category">
      <FormInput
        autoCapitalize="sentences"
        error={fieldErrors.errors.name}
        label="Category name"
        onChangeText={(next) => {
          setName(next);
          fieldErrors.clearField("name");
        }}
        placeholder="e.g. Housekeeping"
        value={name}
      />
      <ActionButton
        disabled={state.isLoading || fieldErrors.blocked}
        icon={Plus}
        label={state.isLoading ? "Creating" : "Create category"}
        onPress={() => void submit()}
      />
      {fieldErrors.serverError ? (
        <AlertModal message={fieldErrors.serverError} onClose={fieldErrors.dismissServerError} />
      ) : null}
    </SheetShell>
  );
}

/** One category in the sheet, with its own delete when it is removable. */

/**
 * One category in the picker, with its delete.
 *
 * <p>Renders through the app's shared picker row, so a category list looks like
 * every other list of options. It used to fill the selected row solid ink — this
 * screen answering "which one is chosen" in its own private language.
 *
 * <p>The delete is the row's `action`, which places it outside the row's own
 * pressable: tapping it cannot also select the category it removes.
 */
function CategoryRow({
  active,
  label,
  onDelete,
  onPress,
}: {
  active: boolean;
  label: string;
  onDelete?: () => void;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();

  // One bordered row containing both controls, matching the staff picker. The
  // delete used to be a separate square BESIDE the row, which read as acting on
  // the list rather than on the category it sat next to.
  //
  // The selected row is filled ink — no tick as well: the fill already says it,
  // and a tick on a solid row is the same fact stated twice.
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.ink : "transparent",
        borderColor: active ? colors.ink : colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
      }}
    >
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={{ flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
      >
        <Text style={[type.bodyStrong, { color: active ? colors.surface : colors.ink }]}>
          {label}
        </Text>
      </AnimatedPressable>

      {onDelete ? (
        <AnimatedPressable
          accessibilityLabel={`Delete ${label} category`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDelete}
          style={{
            alignItems: "center",
            alignSelf: "stretch",
            justifyContent: "center",
            paddingHorizontal: spacing.md,
          }}
        >
          {/* Surface on a selected row: danger red on the ink fill is unreadable
              in one theme or the other. Unselected rows show it red. */}
          <Trash2 color={active ? colors.surface : colors.danger} size={16} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
