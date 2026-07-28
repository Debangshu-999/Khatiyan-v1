import { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Check, ChevronDown, ChevronRight, FolderPlus, Plus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { useToast } from "@/components/toast";
import {
  useCreateLocalPlaceCategoryMutation,
  useCreateLocalPlaceSubcategoryMutation,
  type LocalPlaceCategory,
} from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type CategorySelection = { kind: "category" | "subcategory"; id: string; label: string };

type CategoryPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  categories: LocalPlaceCategory[];
  mode: "filter" | "assign";
  // filter mode
  categoryCounts?: Record<string, number>;
  subcategoryCounts?: Record<string, number>;
  onSelect?: (selection: CategorySelection | null) => void;
  // assign mode
  propertyId?: string;
  selectedSubcategoryIds?: string[];
  onToggleSubcategory?: (id: string) => void;
};

// Centered accordion category picker with a dim backdrop. Used both to pick a
// filter (single category or subcategory) and to assign subcategories when
// creating a place (multi-select + create custom subcategory / category).
export function CategoryPickerModal({
  visible,
  onClose,
  categories,
  mode,
  categoryCounts = {},
  subcategoryCounts = {},
  onSelect,
  propertyId,
  selectedSubcategoryIds = [],
  onToggleSubcategory,
}: CategoryPickerModalProps) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subName, setSubName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [createSubcategory, subState] = useCreateLocalPlaceSubcategoryMutation();
  const [createCategory, catState] = useCreateLocalPlaceCategoryMutation();

  const isFilter = mode === "filter";

  function toggleExpand(categoryId: string) {
    setExpanded((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  }

  async function addSubcategory(categoryId: string) {
    const trimmed = subName.trim();
    if (!trimmed || !propertyId) {
      return;
    }
    try {
      const created = await createSubcategory({ categoryId, name: trimmed, propertyId }).unwrap();
      onToggleSubcategory?.(created.id);
      setSubName("");
      setAddingSubFor(null);
    } catch {
      toast.error("Could not add the subcategory.");
    }
  }

  async function addCategory() {
    const trimmed = categoryName.trim();
    if (!trimmed || !propertyId) {
      return;
    }
    try {
      const created = await createCategory({ name: trimmed, propertyId }).unwrap();
      setExpanded((current) => ({ ...current, [created.id]: true }));
      setCategoryName("");
      setAddingCategory(false);
    } catch {
      toast.error("Could not add the category.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderRadius: 22,
            borderWidth: 1,
            maxHeight: "82%",
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 21, fontWeight: "600" }} selectable>
              {isFilter ? "Filter by category" : "Choose categories"}
            </Text>
            <AnimatedPressable
              accessibilityLabel="Close"
              onPress={onClose}
              style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 32, justifyContent: "center", width: 32 }}
            >
              <X color={colors.ink} size={16} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={{ flexGrow: 0 }}>
            {isFilter ? (
              <AccordionRowButton
                label="All categories"
                onPress={() => {
                  onSelect?.(null);
                  onClose();
                }}
              />
            ) : null}

            {categories.map((category) => {
              const open = Boolean(expanded[category.id]);
              const selectedInCategory = category.subcategories.filter((sub) => selectedSubcategoryIds.includes(sub.id)).length;
              const count = isFilter ? categoryCounts[category.id] ?? 0 : selectedInCategory;

              return (
                <View key={category.id} style={{ borderBottomColor: colors.border, borderBottomWidth: 1 }}>
                  <AnimatedPressable
                    accessibilityLabel={`${open ? "Collapse" : "Expand"} ${category.name}`}
                    onPress={() => toggleExpand(category.id)}
                    style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 50, paddingVertical: spacing.xs }}
                  >
                    {open ? <ChevronDown color={colors.muted} size={18} strokeWidth={2.3} /> : <ChevronRight color={colors.muted} size={18} strokeWidth={2.3} />}
                    <Text style={[type.body, { color: colors.ink, flex: 1, fontWeight: "800" }]} selectable>
                      {category.name}
                    </Text>
                    <CountBadge active={count > 0} value={count} />
                  </AnimatedPressable>

                  {open ? (
                    <View style={{ gap: spacing.xs, paddingBottom: spacing.sm, paddingLeft: spacing.lg }}>
                      {isFilter ? (
                        <AccordionRowButton
                          label={`All ${category.name.toLowerCase()}`}
                          onPress={() => {
                            onSelect?.({ kind: "category", id: category.id, label: category.name });
                            onClose();
                          }}
                          subtle
                        />
                      ) : null}

                      {category.subcategories.map((sub) => {
                        const selected = selectedSubcategoryIds.includes(sub.id);
                        return (
                          <AnimatedPressable
                            accessibilityLabel={sub.name}
                            accessibilityState={{ selected }}
                            key={sub.id}
                            onPress={() => {
                              if (isFilter) {
                                onSelect?.({ kind: "subcategory", id: sub.id, label: sub.name });
                                onClose();
                              } else {
                                onToggleSubcategory?.(sub.id);
                              }
                            }}
                            style={{
                              alignItems: "center",
                              backgroundColor: !isFilter && selected ? colors.primarySoft : "transparent",
                              borderRadius: 10,
                              flexDirection: "row",
                              gap: spacing.sm,
                              minHeight: 42,
                              paddingHorizontal: spacing.sm,
                            }}
                          >
                            {!isFilter ? (
                              <View
                                style={{
                                  alignItems: "center",
                                  backgroundColor: selected ? colors.primary : "transparent",
                                  borderColor: selected ? colors.primary : colors.border,
                                  borderRadius: 6,
                                  borderWidth: 1.5,
                                  height: 18,
                                  justifyContent: "center",
                                  width: 18,
                                }}
                              >
                                {selected ? <Check color={colors.onPrimary} size={12} strokeWidth={3} /> : null}
                              </View>
                            ) : null}
                            <Text style={[type.body, { color: selected ? colors.primary : colors.inkSoft, flex: 1, fontWeight: selected ? "800" : "600" }]} selectable>
                              {sub.name}
                            </Text>
                            {isFilter ? <CountBadge active={(subcategoryCounts[sub.id] ?? 0) > 0} value={subcategoryCounts[sub.id] ?? 0} /> : null}
                          </AnimatedPressable>
                        );
                      })}

                      {!isFilter ? (
                        addingSubFor === category.id ? (
                          <View style={{ gap: spacing.xs }}>
                            <AppTextInput
                              autoCapitalize="words"
                              onChangeText={setSubName}
                              placeholder="New subcategory"
                              placeholderTextColor={colors.muted}
                              style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 14, minHeight: 42, paddingHorizontal: spacing.sm }}
                              value={subName}
                            />
                            <View style={{ flexDirection: "row", gap: spacing.xs }}>
                              <PillButton disabled={subState.isLoading} label={subState.isLoading ? "Adding…" : "Add"} onPress={() => void addSubcategory(category.id)} primary />
                              <PillButton label="Cancel" onPress={() => { setAddingSubFor(null); setSubName(""); }} />
                            </View>
                          </View>
                        ) : (
                          <AnimatedPressable
                            accessibilityLabel={`Add a custom ${category.name} subcategory`}
                            onPress={() => { setAddingSubFor(category.id); setSubName(""); }}
                            style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, minHeight: 38, paddingHorizontal: spacing.sm }}
                          >
                            <Plus color={colors.primary} size={14} strokeWidth={2.6} />
                            <Text style={[type.caption, { color: colors.primary, fontWeight: "800" }]}>Add subcategory</Text>
                          </AnimatedPressable>
                        )
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {!isFilter ? (
              addingCategory ? (
                <View style={{ gap: spacing.xs, paddingTop: spacing.md }}>
                  <AppTextInput
                    autoCapitalize="words"
                    onChangeText={setCategoryName}
                    placeholder="New category name"
                    placeholderTextColor={colors.muted}
                    style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fonts.sans, fontSize: 14, minHeight: 44, paddingHorizontal: spacing.sm }}
                    value={categoryName}
                  />
                  <View style={{ flexDirection: "row", gap: spacing.xs }}>
                    <PillButton disabled={catState.isLoading} label={catState.isLoading ? "Creating…" : "Create category"} onPress={() => void addCategory()} primary />
                    <PillButton label="Cancel" onPress={() => { setAddingCategory(false); setCategoryName(""); }} />
                  </View>
                </View>
              ) : (
                <AnimatedPressable
                  accessibilityLabel="Create a custom category"
                  onPress={() => setAddingCategory(true)}
                  style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, minHeight: 46 }}
                >
                  <FolderPlus color={colors.primary} size={17} strokeWidth={2.3} />
                  <Text style={[type.body, { color: colors.primary, fontWeight: "800" }]}>Create custom category</Text>
                </AnimatedPressable>
              )
            ) : null}
          </ScrollView>

          {!isFilter ? (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onClose}
              style={{ alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, marginTop: spacing.md, minHeight: 46, justifyContent: "center" }}
            >
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }}>
                Done ({selectedSubcategoryIds.length})
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function AccordionRowButton({ label, onPress, subtle }: { label: string; onPress: () => void; subtle?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ borderBottomColor: subtle ? "transparent" : colors.border, borderBottomWidth: subtle ? 0 : 1, justifyContent: "center", minHeight: subtle ? 40 : 48, paddingHorizontal: subtle ? spacing.sm : 0 }}
    >
      <Text style={[type.body, { color: colors.primary, fontWeight: subtle ? "700" : "900" }]} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function CountBadge({ active, value }: { active: boolean; value: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ backgroundColor: active ? colors.primarySoft : colors.surfaceSunken, borderRadius: 999, minWidth: 24, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: active ? colors.primary : colors.muted, fontFamily: fonts.sans, fontSize: 11, fontVariant: ["tabular-nums"], fontWeight: "800", textAlign: "center" }}>
        {value}
      </Text>
    </View>
  );
}

function PillButton({ disabled, label, onPress, primary }: { disabled?: boolean; label: string; onPress: () => void; primary?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? colors.primary : colors.surface,
        borderColor: primary ? "transparent" : colors.border,
        borderRadius: 10,
        borderWidth: 1,
        justifyContent: "center",
        minHeight: 40,
        opacity: disabled ? 0.6 : 1,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text style={{ color: primary ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "800" }}>{label}</Text>
    </AnimatedPressable>
  );
}
