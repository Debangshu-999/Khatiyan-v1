import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ClipboardList, FolderPlus, Pencil, Plus, X } from "lucide-react-native";
import { DeleteIcon as Trash2 } from "@/components/delete-icon";

import { Card } from "@/components/card";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { Section } from "@/components/section";
import { OwnerBoardCategoriesSkeleton } from "@/components/skeletons/owner";
import { AlertModal } from "@/components/alert-modal";
import { useKeyboardInset } from "@/components/use-keyboard-inset";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, FormInput, IconButton, ViewOnlyChip } from "@/features/owner/owner-ui";
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

const NO_CATEGORY_ILLUSTRATION = require("../assets/empty-states/No-Category_512x512.png");

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
  const boardLoading =
    (categoriesQuery.isFetching && !categoriesQuery.data) ||
    (itemsQuery.isFetching && !itemsQuery.data);

  const [deactivateCategory] = useDeactivateBoardCategoryMutation();
  const [deactivateItem] = useDeactivateBoardItemMutation();

  const [categoryModal, setCategoryModal] = useState<{ category: BoardCategory | null } | null>(null);
  const [itemModal, setItemModal] = useState<{ item: BoardItem | null; categoryId: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "category" | "item"; id: string; label: string } | null>(null);

  return (
    <View style={{ flex: 1 }}>
    <ScreenScrollView
      contentContainerStyle={{ paddingBottom: selectedProperty ? PINNED_FOOTER_CLEARANCE : undefined }}
      safeAreaEdges={selectedProperty ? ["top"] : ["top", "bottom"]}
    >
      <ScreenHeader
        badge={!canManageBoard ? <ViewOnlyChip /> : null}
        title="Property"
        italicTail="board."
        subtitle="Always-on info for tenants — rules, timings, contacts and shared information, organised by category."
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={ClipboardList}

          title="No active property selected"
          description="Choose the property whose board you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          {boardLoading ? (
            <OwnerBoardCategoriesSkeleton />
          ) : categories.length === 0 ? (
            <EmptyState
              artwork={NO_CATEGORY_ILLUSTRATION}
              title="No categories yet"
              description="Create a category (e.g. Rules, Timings, Contacts) before adding board items."
            />
          ) : (
            categories.map((category) => {
              const categoryItems = items.filter((item) => item.categoryId === category.id);
              return (
                <Section
                  key={category.id}

                  title={category.name}
                >
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    <ActionButton disabled={!canManageBoard} icon={Pencil} label="Edit category" onPress={() => setCategoryModal({ category })} variant="secondary" />
                    <ActionButton
                      disabled={!canManageBoard}
                      icon={Trash2}
                      label="Delete"
                      onPress={() => setPendingDelete({ id: category.id, kind: "category", label: category.name })}
                      variant="dangerFilled"
                    />
                  </View>
                  {categoryItems.length === 0 ? (
                    <Text style={[type.description, { color: colors.muted }]}>
                      No items in this category yet.
                    </Text>
                  ) : (
                    categoryItems.map((item) => (
                      <BoardItemCard
                        canManage={canManageBoard}
                        key={item.id}
                        item={item}
                        onDelete={() => setPendingDelete({ id: item.id, kind: "item", label: item.title })}
                        onEdit={() => setItemModal({ categoryId: item.categoryId, item })}
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

        </>
      ) : null}

      {categoryModal && selectedProperty ? (
        <CategoryModal category={categoryModal.category} onClose={() => setCategoryModal(null)} propertyId={selectedProperty.id} />
      ) : null}

      {itemModal && selectedProperty ? (
        <ItemModal
          categoryId={itemModal.categoryId}
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
    {selectedProperty ? (
      <PinnedFooter>
        <ActionButton disabled={!canManageBoard} icon={FolderPlus} label="Add category" onPress={() => setCategoryModal({ category: null })} />
      </PinnedFooter>
    ) : null}
    </View>
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
        <Text style={[type.description, { color: colors.muted }]}>
          {item.body}
        </Text>
      </View>
    </Card>
  );
}

function CategoryModal({ category, onClose, propertyId }: { category: BoardCategory | null; onClose: () => void; propertyId: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [name, setName] = useState(category?.name ?? "");
  const [order, setOrder] = useState(category ? String(category.displayOrder) : "");
  const form = useFormErrors<"name">();
  const [createCategory, createState] = useCreateBoardCategoryMutation();
  const [updateCategory, updateState] = useUpdateBoardCategoryMutation();
  const busy = createState.isLoading || updateState.isLoading;

  async function submit() {
    if (busy) {
      return;
    }
    if (!form.validate(name.trim() ? {} : { name: "Enter a category name." })) {
      return;
    }
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
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  }

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "flex-end", width: "100%" }}>
        <View style={{ alignSelf: "stretch", backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, gap: spacing.md, marginBottom: keyboardInset, paddingBottom: spacing.lg + (keyboardInset > 0 ? 0 : insets.bottom), paddingHorizontal: spacing.lg, paddingTop: spacing.lg, width: "100%" }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
              {category ? "Edit category" : "New category"}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={() => dismiss()} />
          </View>
          <FormInput
            error={form.errors.name}
            label="Name"
            onChangeText={(next) => {
              setName(next);
              form.clearField("name");
            }}
            placeholder="Rules, Timings, Contacts…"
            value={name}
          />
          <FormInput keyboardType="number-pad" label="Display order (optional)" onChangeText={setOrder} placeholder="e.g. 1" value={order} />
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={busy || form.blocked} label={busy ? "Saving" : "Save category"} onPress={() => void submit()} />
          </View>
          {form.serverError ? (
            <AlertModal message={form.serverError} onClose={form.dismissServerError} />
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
      )}
    </BottomSheetModal>
  );
}

function ItemModal({
  categoryId,
  item,
  onClose,
  propertyId,
}: {
  categoryId: string;
  item: BoardItem | null;
  onClose: () => void;
  propertyId: string;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const form = useFormErrors<"title" | "body">();
  const [createItem, createState] = useCreateBoardItemMutation();
  const [updateItem, updateState] = useUpdateBoardItemMutation();
  const busy = createState.isLoading || updateState.isLoading;

  async function submit() {
    if (busy) {
      return;
    }
    // Every problem reported at once, each against the field that owns it —
    // rather than one message naming two fields and stopping at the first.
    const problems = {
      ...(title.trim() ? {} : { title: "Enter a title." }),
      ...(body.trim() ? {} : { body: "Enter the details tenants will read." }),
    };
    if (!form.validate(problems)) {
      return;
    }
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
    } catch (caught) {
      form.failFromServer(errorMessage(caught));
    }
  }

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "flex-end", width: "100%" }}>
        <View style={{ alignSelf: "stretch", backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, gap: spacing.md, marginBottom: keyboardInset, paddingBottom: spacing.lg + (keyboardInset > 0 ? 0 : insets.bottom), paddingHorizontal: spacing.lg, paddingTop: spacing.lg, width: "100%" }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
              {item ? "Edit item" : "New item"}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={() => dismiss()} />
          </View>
          <FormInput
            error={form.errors.title}
            label="Title"
            onChangeText={(next) => {
              setTitle(next);
              form.clearField("title");
            }}
            placeholder="Item title"
            value={title}
          />
          <FormInput
            error={form.errors.body}
            multiline
            label="Body"
            onChangeText={(next) => {
              setBody(next);
              form.clearField("body");
            }}
            placeholder="Details shown to tenants"
            value={body}
          />
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={busy || form.blocked} label={busy ? "Saving" : "Save item"} onPress={() => void submit()} />
          </View>
          {form.serverError ? (
            <AlertModal message={form.serverError} onClose={form.dismissServerError} />
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
      )}
    </BottomSheetModal>
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
