import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Text, View } from "react-native";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ClipboardList, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react-native";

import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { ActionButton, ChoiceButton, ConfirmDialog, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  useCreateBoardCategoryMutation,
  useCreateBoardItemMutation,
  useDeactivateBoardCategoryMutation,
  useDeactivateBoardItemMutation,
  useListBoardCategoriesQuery,
  useListBoardItemsQuery,
  useUpdateBoardCategoryMutation,
  useUpdateBoardItemMutation,
  type BoardCategory,
  type BoardItem,
} from "@/store/services/property-board-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerBoardScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);
  const propertyId = selectedProperty?.id ?? "";
  // Adding, editing and removing board content is PROPERTY_BOARD at MANAGE.
  const { canManage: canManageResource } = usePropertyPermissions(selectedProperty?.id);
  const canManageBoard = canManageResource("PROPERTY_BOARD");

  const categoriesQuery = useListBoardCategoriesQuery(propertyId, { skip: !selectedProperty });
  const itemsQuery = useListBoardItemsQuery(propertyId, { skip: !selectedProperty });
  const categories = (categoriesQuery.data ?? []).filter((category) => category.active);
  const items = (itemsQuery.data ?? []).filter((item) => item.active);

  const [deactivateCategory] = useDeactivateBoardCategoryMutation();
  const [deactivateItem] = useDeactivateBoardItemMutation();

  const [categoryModal, setCategoryModal] = useState<{ category: BoardCategory | null } | null>(null);
  const [itemModal, setItemModal] = useState<{ item: BoardItem | null; categoryId?: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "category" | "item"; id: string; label: string } | null>(null);

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        badge={!canManageBoard ? <ViewOnlyChip /> : null}
        eyebrow="Property"
        onBack={() => router.back()}
        title="Property"
        italicTail="board."
        subtitle="Categories and items shown on this property's board."
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={ClipboardList}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property whose board you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <Card>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              Property board
            </Text>
            <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]}>
              {selectedProperty.name}
            </Text>
            <Text style={[type.body, { color: colors.muted }]}>
              Always-on info for tenants — rules, timings, contacts and shared information, organised by category.
            </Text>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={!canManageBoard} icon={FolderPlus} label="Add category" onPress={() => setCategoryModal({ category: null })} variant="secondary" />
          </View>

          {categories.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              eyebrow="Start here"
              title="No categories yet"
              description="Create a category (e.g. Rules, Timings, Contacts) before adding board items."
            />
          ) : (
            categories.map((category) => {
              const categoryItems = items.filter((item) => item.categoryId === category.id);
              return (
                <Section
                  key={category.id}
                  eyebrow="Category"
                  title={category.name}
                >
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    <ActionButton disabled={!canManageBoard} icon={Pencil} label="Edit category" onPress={() => setCategoryModal({ category })} variant="secondary" />
                    <ActionButton
                      disabled={!canManageBoard}
                      icon={Trash2}
                      label="Delete"
                      onPress={() => setPendingDelete({ id: category.id, kind: "category", label: category.name })}
                      variant="danger"
                    />
                  </View>
                  {categoryItems.length === 0 ? (
                    <Text style={[type.caption, { color: colors.muted }]}>
                      No items in this category yet.
                    </Text>
                  ) : (
                    categoryItems.map((item) => (
                      <BoardItemCard
                        canManage={canManageBoard}
                        key={item.id}
                        item={item}
                        onDelete={() => setPendingDelete({ id: item.id, kind: "item", label: item.title })}
                        onEdit={() => setItemModal({ item })}
                      />
                    ))
                  )}
                  <View style={{ flexDirection: "row" }}>
                    <ActionButton
                      disabled={!canManageBoard}
                      icon={Plus}
                      label="Add item"
                      onPress={() => setItemModal({ categoryId: category.id, item: null })}
                      variant="secondary"
                    />
                  </View>
                </Section>
              );
            })
          )}

          {(categoriesQuery.isFetching || itemsQuery.isFetching) && categories.length === 0 ? (
            <SkeletonCard />
          ) : null}
        </>
      ) : null}

      {categoryModal && selectedProperty ? (
        <CategoryModal category={categoryModal.category} onClose={() => setCategoryModal(null)} propertyId={selectedProperty.id} />
      ) : null}

      {itemModal && selectedProperty ? (
        <ItemModal
          categories={categories}
          initialCategoryId={itemModal.categoryId}
          item={itemModal.item}
          onClose={() => setItemModal(null)}
          propertyId={selectedProperty.id}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          confirmLabel="Delete"
          destructive
          message={
            pendingDelete.kind === "category"
              ? `Delete the category "${pendingDelete.label}" and its items from the board?`
              : `Delete the board item "${pendingDelete.label}"?`
          }
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            if (!selectedProperty) {
              return;
            }
            if (target.kind === "category") {
              void deactivateCategory({ categoryId: target.id, propertyId: selectedProperty.id });
            } else {
              void deactivateItem({ itemId: target.id, propertyId: selectedProperty.id });
            }
          }}
          title={pendingDelete.kind === "category" ? "Delete category?" : "Delete item?"}
        />
      ) : null}
    </ScreenScrollView>
  );
}

function BoardItemCard({
  canManage,
  item,
  onDelete,
  onEdit,
}: {
  // Edit and delete are removed rather than greyed on a per-item row: two dead
  // icons repeated down a list is noise, where one dead "Add" button at the top
  // reads as a locked capability.
  canManage: boolean;
  item: BoardItem;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.sm }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 18, }}>
            {item.title}
          </Text>
          <View style={{ flexDirection: "row" }}>
            {canManage ? (
              <>
                <IconButton accessibilityLabel="Edit item" icon={Pencil} onPress={onEdit} />
                <IconButton accessibilityLabel="Delete item" icon={Trash2} onPress={onDelete} />
              </>
            ) : null}
          </View>
        </View>
        <Text style={[type.body, { color: colors.muted }]}>
          {item.body}
        </Text>
      </View>
    </Card>
  );
}

function CategoryModal({ category, onClose, propertyId }: { category: BoardCategory | null; onClose: () => void; propertyId: string }) {
  const { colors, fonts, type } = useTheme();
  const [name, setName] = useState(category?.name ?? "");
  const [order, setOrder] = useState(category ? String(category.displayOrder) : "");
  const [error, setError] = useState<string | null>(null);
  const [createCategory, createState] = useCreateBoardCategoryMutation();
  const [updateCategory, updateState] = useUpdateBoardCategoryMutation();
  const busy = createState.isLoading || updateState.isLoading;

  async function submit() {
    if (busy) {
      return;
    }
    if (!name.trim()) {
      setError("Enter a category name.");
      return;
    }
    setError(null);
    const trimmedName = name.trim();
    // Backend requires a non-blank, property-unique slug; derive it from the
    // name so management never has to type one by hand.
    const payload = { displayOrder: order.trim() ? Number(order) : null, name: trimmedName, slug: slugify(trimmedName) };
    try {
      if (category) {
        await updateCategory({ categoryId: category.id, payload, propertyId }).unwrap();
      } else {
        await createCategory({ payload, propertyId }).unwrap();
      }
      onClose();
    } catch {
      setError("Could not save the category. Try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.md, padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
              {category ? "Edit category" : "New category"}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <FormInput label="Name" onChangeText={setName} placeholder="Rules, Timings, Contacts…" value={name} />
          <FormInput keyboardType="number-pad" label="Display order (optional)" onChangeText={setOrder} placeholder="e.g. 1" value={order} />
          {error ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={busy} label={busy ? "Saving" : "Save category"} onPress={() => void submit()} />
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ItemModal({
  categories,
  initialCategoryId,
  item,
  onClose,
  propertyId,
}: {
  categories: BoardCategory[];
  initialCategoryId?: string;
  item: BoardItem | null;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [createItem, createState] = useCreateBoardItemMutation();
  const [updateItem, updateState] = useUpdateBoardItemMutation();
  const busy = createState.isLoading || updateState.isLoading;

  async function submit() {
    if (busy) {
      return;
    }
    if (!categoryId) {
      setError("Pick a category.");
      return;
    }
    if (!title.trim() || !body.trim()) {
      setError("Enter a title and body.");
      return;
    }
    setError(null);
    // The update endpoint requires a non-null displayOrder; preserve the
    // item's existing order on edit and let the backend default it on create.
    const payload = { body: body.trim(), categoryId, displayOrder: item ? item.displayOrder : null, title: title.trim() };
    try {
      if (item) {
        await updateItem({ itemId: item.id, payload, propertyId }).unwrap();
      } else {
        await createItem({ payload, propertyId }).unwrap();
      }
      onClose();
    } catch {
      setError("Could not save the item. Try again.");
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.md, padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
              {item ? "Edit item" : "New item"}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]}>
              Category
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {categories.map((category) => (
                <ChoiceButton active={category.id === categoryId} key={category.id} label={category.name} onPress={() => setCategoryId(category.id)} />
              ))}
            </View>
          </View>
          <FormInput label="Title" onChangeText={setTitle} placeholder="Item title" value={title} />
          <FormInput multiline label="Body" onChangeText={setBody} placeholder="Details shown to tenants" value={body} />
          {error ? (
            <Text style={[type.caption, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={busy} label={busy ? "Saving" : "Save item"} onPress={() => void submit()} />
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Turns a display name into a URL-safe, property-unique-ish slug. Falls back to
// a timestamp suffix when the name has no alphanumeric characters (e.g. emoji).
function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || `category-${Date.now().toString(36)}`;
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}
