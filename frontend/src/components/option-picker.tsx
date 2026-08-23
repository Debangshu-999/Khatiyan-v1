import { useState } from "react";
import { Text, View } from "react-native";
import { Check, ChevronDown, Filter } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { RequiredMark } from "@/features/owner/owner-ui";
import { SheetShell } from "@/components/sheet-shell";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type PickerOption<T extends string> = { label: string; value: T };

/**
 * A field that opens a sheet of options, in the shape the staff workspace uses
 * for its category filter.
 *
 * <p>Long option sets do not belong in a wrap of chips. Ten sharing types
 * reflow into four ragged rows that push the rest of a form off-screen, and the
 * chosen ones are only findable by scanning every chip. Collapsed to a field,
 * the answer is one line of text and the options only exist while being
 * chosen.
 *
 * <p>Single mode commits and closes on tap — there is nothing further to say.
 * Multi mode keeps the sheet open and marks each row with a tick, because
 * closing after every tap would make choosing three options a three-trip
 * journey.
 */
export function OptionPicker<T extends string>({
  emptyLabel,
  error,
  label,
  onChange,
  options,
  required,
  title,
  value,
}: {
  /** Shown as the value when nothing is chosen. */
  emptyLabel: string;
  /** Inline validation message; tints the field red while present. */
  error?: string;
  label: string;
  onChange: (value: T[]) => void;
  options: PickerOption<T>[];
  required?: boolean;
  /** Sheet heading. Defaults to the field label. */
  title?: string;
  /** Always a list; single-select callers pass at most one. */
  value: T[];
}) {
  const [open, setOpen] = useState(false);

  const chosen = options.filter((option) => value.includes(option.value));

  function toggle(option: T) {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }

  return (
    <>
      <PickerField
        error={error}
        label={label}
        onPress={() => setOpen(true)}
        required={required}
        value={chosen.length > 0 ? chosen.map((option) => option.label).join(", ") : emptyLabel}
      />
      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={title ?? label}>
          <View style={{ gap: spacing.xs }}>
            {options.map((option) => (
              <OptionRow
                active={value.includes(option.value)}
                key={option.value}
                label={option.label}
                multiple
                onPress={() => toggle(option.value)}
              />
            ))}
          </View>
        </SheetShell>
      ) : null}
    </>
  );
}

/** The single-choice twin. Commits and closes on tap; no tick column. */
export function SingleOptionPicker<T extends string>({
  error,
  label,
  onChange,
  options,
  required,
  title,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: T) => void;
  options: PickerOption<T>[];
  required?: boolean;
  title?: string;
  value: T;
}) {
  const [open, setOpen] = useState(false);

  const chosen = options.find((option) => option.value === value);

  return (
    <>
      <PickerField error={error} label={label} onPress={() => setOpen(true)} required={required} value={chosen?.label ?? "Select"} />
      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={title ?? label}>
          <View style={{ gap: spacing.xs }}>
            {options.map((option) => (
              <OptionRow
                active={option.value === value}
                key={option.value}
                label={option.label}
                multiple={false}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              />
            ))}
          </View>
        </SheetShell>
      ) : null}
    </>
  );
}

function PickerField({
  error,
  label,
  onPress,
  required,
  value,
}: {
  error?: string;
  label: string;
  onPress: () => void;
  required?: boolean;
  value: string;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: 6 }}>
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
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
          {label}
          <RequiredMark required={required} />
        </Text>
        <Text style={[type.bodyStrong, { color: colors.ink }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
    <FieldError message={error} />
    </View>
  );
}

function OptionRow({
  active,
  label,
  multiple,
  onPress,
}: {
  active: boolean;
  label: string;
  multiple: boolean;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.ink : "transparent",
        borderColor: active ? colors.ink : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <Text style={[type.bodyStrong, { color: active ? colors.surface : colors.ink, flex: 1 }]}>{label}</Text>
      {/* Only multi-select needs a tick: it is the sole cue that a tap
          registered, since the sheet stays open. */}
      {multiple && active ? <Check color={colors.surface} size={16} strokeWidth={2.6} /> : null}
    </AnimatedPressable>
  );
}
