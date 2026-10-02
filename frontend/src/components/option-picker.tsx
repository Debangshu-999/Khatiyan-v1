import { CenterModal } from "@/components/center-modal";
import { useState, type ReactNode } from "react";
import { Modal, Text, View } from "react-native";
import { ChevronDown, Filter, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { FieldError } from "@/components/field-error";
import { IconButton, RequiredMark } from "@/features/owner/owner-ui";
import { PickerOptionRow } from "@/components/picker-option-row";
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
  showIcon = true,
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
  /**
     * The leading glyph. Off where the field is plainly a choice rather than a
     * filter — the icon says "narrow this down", which is wrong for a field
     * that asks which of six documents somebody was shown.
     */
  showIcon?: boolean;
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
        placeholder={chosen.length === 0}
        required={required}
        showIcon={showIcon}
        value={chosen.length > 0 ? chosen.map((option) => option.label).join(", ") : emptyLabel}
      />
      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={title ?? label}>
          {/* No gap: the rows are ruled, so spacing them apart would separate
              each hairline from the row it belongs to. */}
          <View>
            {options.map((option, index) => (
              <PickerOptionRow
                first={index === 0}
                key={option.value}
                label={option.label}
                mode="multi"
                onPress={() => toggle(option.value)}
                selected={value.includes(option.value)}
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
  centered,
  emptyLabel = "Select",
  error,
  label,
  onChange,
  optionIcon,
  options,
  required,
  showIcon = true,
  title,
  value,
}: {
  /** An icon before each option's name, where the options have one worth showing. */
  optionIcon?: (value: T) => ReactNode;
  /**
   * Opens a centred dialog instead of a bottom sheet.
   *
   * <p>For a handful of short options. A sheet that covers half the screen to
   * ask which of four things happened is more movement than the choice is
   * worth, and the answer arrives under the reader's thumb either way.
   */
  centered?: boolean;
  /** Shown as the value while nothing is chosen. */
  emptyLabel?: string;
  error?: string;
  showIcon?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: PickerOption<T>[];
  required?: boolean;
  title?: string;
  /** Null before a choice is made, which is where every one of these starts. */
  value: T | null;
}) {
  const [open, setOpen] = useState(false);
  const { colors, fonts } = useTheme();

  const chosen = options.find((option) => option.value === value);

  return (
    <>
      <PickerField
        error={error}
        label={label}
        onPress={() => setOpen(true)}
        placeholder={!chosen}
        required={required}
        showIcon={showIcon}
        value={chosen?.label ?? emptyLabel}
      />
      {open ? (
        centered ? (
          <CenterModal
            animationType="fade"
            navigationBarTranslucent
            onRequestClose={() => setOpen(false)}
            statusBarTranslucent
            transparent
            visible
          >
            {/* Closes only by its close button or a choice (user, 2026-09-29):
                a tap on the scrim does nothing. */}
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.overlay,
                flex: 1,
                justifyContent: "center",
                paddingHorizontal: spacing.xl,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderCurve: "continuous",
                  borderRadius: 14,
                  overflow: "hidden",
                  width: "100%",
                }}
              >
                <View
                  style={{
                    alignItems: "center",
                    flexDirection: "row",
                    gap: spacing.sm,
                    paddingLeft: spacing.lg,
                    paddingRight: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ color: colors.muted, flex: 1, fontFamily: fonts.display, fontSize: 19 }}>
                    {title ?? label}
                  </Text>
                  <IconButton accessibilityLabel="Close" filled icon={X} onPress={() => setOpen(false)} />
                </View>

                <View style={{ paddingBottom: spacing.md, paddingHorizontal: spacing.md }}>
                  {options.map((option) => (
                    <PickerOptionRow
                      icon={optionIcon?.(option.value)}
                      key={option.value}
                      label={option.label}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      selected={option.value === value}
                    />
                  ))}
                </View>
              </View>
            </View>
          </CenterModal>
        ) : (
          <SheetShell onClose={() => setOpen(false)} title={title ?? label}>
            <View>
              {options.map((option, index) => (
                <PickerOptionRow
                  first={index === 0}
                  icon={optionIcon?.(option.value)}
                  key={option.value}
                  label={option.label}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  selected={option.value === value}
                />
              ))}
            </View>
          </SheetShell>
        )
      ) : null}
    </>
  );
}

function PickerField({
  error,
  label,
  onPress,
  placeholder,
  required,
  showIcon = true,
  value,
}: {
  error?: string;
  label: string;
  onPress: () => void;
  /**
   * True while nothing is chosen, so the prompt can be set as a prompt.
   *
   * <p>A chosen value and an instruction to choose one are different kinds of
   * text and should not share a style — at the same size and weight, "Select
   * the ID you checked" reads as an answer somebody already gave.
   */
  placeholder?: boolean;
  required?: boolean;
  showIcon?: boolean;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: 6 }}>
      {/* Above the box, not inside it — exactly where FormInput puts its own.
          Stacked inside the border, the label was part of the control: two
          lines of text in a bordered box read as a value and its caption, so a
          picker sitting next to a text input looked like a different kind of
          field rather than the same field with a different way of answering. */}
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>
        {label}
        <RequiredMark required={required} />
      </Text>

      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          // Squarer than a card. A picker is an input, and inputs keep their
          // own corner — at 14 this read as a small card you could tap rather
          // than a field waiting for an answer.
          borderRadius: 8,
          borderWidth: 1.5,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 50,
          paddingHorizontal: spacing.md,
        }}
      >
        {showIcon ? (
          <Filter color={error ? colors.danger : colors.kicker} size={16} strokeWidth={2.2} />
        ) : null}

        {/* Smaller than a typed value. A list of chosen options is a summary of
            what is inside the sheet, not something entered here, and at input
            size four sharing types filled the field and pushed out the chevron. */}
        <Text
          numberOfLines={1}
          style={
            placeholder
              ? [type.caption, { color: colors.muted, flex: 1 }]
              : { color: colors.ink, flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13 }
          }
        >
          {value}
        </Text>

        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </AnimatedPressable>

      <FieldError message={error} />
    </View>
  );
}
