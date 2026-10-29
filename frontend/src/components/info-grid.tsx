import { CircleHelp, FileText, X, type LucideProps } from "lucide-react-native";
import type { ComponentType, ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { CenterModal } from "@/components/center-modal";
import { FitText } from "@/components/fit-text";
import { ModalTitle } from "@/components/modal-title";
import { IconButton } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type InfoCell = { icon: ComponentType<LucideProps>; label: string; value: string };
export type NoteCell = { label: string; onPress: () => void };

/**
 * A request card's facts in two columns ruled by hairlines, the label over its
 * value, with the free-text fields side by side in the last row (user,
 * 2026-10-28, for room-change and exit request cards). An odd count leaves the
 * last cell blank rather than stretching one across.
 */
export function InfoGrid({ cells, notes = [] }: { cells: InfoCell[]; notes?: NoteCell[] }) {
  const rows = pairs(cells);
  const noteRows = pairs(notes);

  return (
    <View>
      {rows.map((row, index) => (
        <GridRow key={`cells-${index}`} ruled={index > 0}>
          {row.map((cell, column) => (
            <GridSlot column={column} key={cell?.label ?? `blank-${column}`} padding={spacing.sm}>
              {cell ? <GridCell cell={cell} /> : null}
            </GridSlot>
          ))}
        </GridRow>
      ))}
      {noteRows.map((row, index) => (
        <GridRow key={`notes-${index}`} ruled={rows.length > 0 || index > 0}>
          {row.map((note, column) => (
            <GridSlot column={column} key={note?.label ?? `blank-${column}`} padding={spacing.xs}>
              {note ? <NoteButton note={note} /> : null}
            </GridSlot>
          ))}
        </GridRow>
      ))}
    </View>
  );
}

function GridRow({ children, ruled }: { children: ReactNode; ruled: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderTopColor: colors.border, borderTopWidth: ruled ? 1 : 0, flexDirection: "row" }}>
      {children}
    </View>
  );
}

function GridSlot({ children, column, padding }: { children: ReactNode; column: number; padding: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderLeftColor: colors.border,
        borderLeftWidth: column > 0 ? 1 : 0,
        flex: 1,
        gap: 3,
        minWidth: 0,
        paddingLeft: column > 0 ? spacing.md : 0,
        paddingRight: column === 0 ? spacing.md : 0,
        paddingVertical: padding,
      }}
    >
      {children}
    </View>
  );
}

function pairs<T>(items: T[]): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let at = 0; at < items.length; at += 2) rows.push([items[at], items[at + 1] ?? null]);
  return rows;
}

function GridCell({ cell: { icon: Icon, label, value } }: { cell: InfoCell }) {
  const { colors, type } = useTheme();
  return (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
        <Icon color={colors.kicker} size={13} strokeWidth={2.1} />
        <FitText numberOfLines={1} style={[type.caption, { color: colors.muted, flexShrink: 1 }]}>{label}</FitText>
      </View>
      <FitText numberOfLines={1} style={[type.caption, { color: colors.ink, fontSize: 13.5, fontWeight: "700" }]}>
        {value}
      </FitText>
    </>
  );
}

/** A free-text field, opened to read: its name with a help mark, the whole cell pressable. */
function NoteButton({ note }: { note: NoteCell }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={`View ${note.label.toLowerCase()}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={note.onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 32 }}
    >
      <FileText color={colors.kicker} size={13} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{note.label}</Text>
      <CircleHelp color={colors.ink} size={15} strokeWidth={2.3} />
    </AnimatedPressable>
  );
}

/**
 * A reason or notes, read in full. A mark beside the title, the close at the
 * far edge, and the words on their own ground, scrolling when long (user,
 * 2026-10-28). Closes by its own button or the device back button, never a
 * tap on the scrim.
 */
export function InfoPopover({ onClose, title, value }: { onClose: () => void; title: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <CenterModal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "70%",
            maxWidth: 380,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                borderColor: colors.borderStrong,
                borderRadius: 999,
                borderWidth: 1,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <FileText color={colors.ink} size={17} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>{title}</ModalTitle>
            </View>
            <IconButton accessibilityLabel="Close" filled icon={X} onPress={onClose} />
          </View>
          <ScrollView
            contentContainerStyle={{ padding: spacing.md }}
            style={{ backgroundColor: colors.surfaceSunken, borderRadius: radii.card, flexGrow: 0 }}
          >
            <Text selectable style={[type.body, { color: colors.ink, lineHeight: 22 }]}>
              {value}
            </Text>
          </ScrollView>
        </View>
      </View>
    </CenterModal>
  );
}
