import { useState } from "react";
import { ItemConditionChip } from "@/features/tenancy/item-condition";
import { Image, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { ChecklistArt } from "@/components/checklist-art";
import { LinearGradient } from "expo-linear-gradient";

import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Lightbox } from "@/components/image-carousel";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { useGetMoveInChecklistQuery, useGetMyActiveTenancyQuery, useListMyRoomItemsQuery, useRespondMoveInChecklistMutation, type MoveInChecklist, type MyRoomItem } from "@/store/services/tenancy-api";
import { DamageLevelPill } from "@/features/tenancy/damage-level";
import { radii, spacing } from "@/theme/spacing";
import { cardShadow, softShadow } from "@/theme/shadows";
import { FactColumn } from "@/features/tenancy/request-form-cards";
import { useTheme } from "@/theme/use-theme";

/**
 * A stay's move-in checklist (user, 2026-10-29): the room's condition when the
 * tenant moved in. The tenant reads it and answers within 48 hours, "Looks
 * right" or a note of what is different. Management reads it, and it is the
 * record the room is compared against at move-out.
 */
export default function MoveInChecklistScreen() {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ tenancyId?: string; role?: string }>();
  const tenancyId = typeof params.tenancyId === "string" ? params.tenancyId : "";
  const asTenant = params.role === "tenant";
  const query = useGetMoveInChecklistQuery(tenancyId, { skip: !tenancyId });
  const [respond, respondState] = useRespondMoveInChecklistMutation();
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const checklist = query.data ?? null;
  // Nothing on record: the tenant still sees their room's items (user, 2026-11-11).
  const activeTenancyQuery = useGetMyActiveTenancyQuery(undefined, { skip: !asTenant });
  const roomItemsQuery = useListMyRoomItemsQuery(undefined, { skip: !asTenant || query.isLoading || Boolean(checklist) });

  async function answer(looksRight: boolean) {
    if (!looksRight && !note.trim()) {
      setNoteError("Write what is different from the checklist.");
      return;
    }
    try {
      await respond({ looksRight, note: looksRight ? null : note.trim(), tenancyId }).unwrap();
      setNoting(false);
      toast.success(looksRight ? "Checklist accepted." : "Your note was sent.");
    } catch (caught) {
      setRefusal(errorMessage(caught));
    }
  }

  const loadFailed = loadFailure(query);
  if (loadFailed) {
    return <LoadFailedScreen failure={loadFailed} />;
  }

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        bottomPaddingCovered={Boolean(checklist?.canRespond)}
        contentContainerStyle={checklist?.canRespond ? { paddingBottom: PINNED_FOOTER_CLEARANCE } : undefined}
        safeAreaEdges={["top", "bottom"]}
      >
        <ScreenHeader
          italicTail="checklist."
          subtitle={checklist ? `The room's condition when ${asTenant ? "you" : "the tenant"} moved in, recorded on ${formatDateLong(new Date(checklist.recordedAt))}.` : "The room's condition at move-in."}
          title="Move-in"
        />

        {query.isLoading ? (
          <SkeletonCard />
        ) : !checklist && asTenant ? (
          <RoomItemsAccepted acceptedOn={activeTenancyQuery.data?.tenancy.startDate ?? null} items={roomItemsQuery.data ?? []} loading={roomItemsQuery.isLoading} />
        ) : !checklist ? (
          <EmptyState description="No checklist was recorded when this stay began." icon={ClipboardList} title="No move-in checklist" />
        ) : (
          <>
            <StatusNotice asTenant={asTenant} checklist={checklist} />

            {/* Keys first, then the items by section, as they were recorded (user, 2026-10-29). */}
            <Card>
              <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
                <Text style={[type.body, { color: colors.muted, flex: 1 }]}>Keys handed over</Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{checklist.keysHandedOver ?? "-"}</Text>
              </View>
            </Card>

            {/* Each item's condition, note and photos, no damage levels (user, 2026-11-07). */}
            {SECTIONS.map(({ section, tail, title }) => {
              const items = checklist.items.filter((item) => (item.section ?? "ROOM") === section);
              if (items.length === 0) return null;
              return (
                <View key={section} style={{ gap: spacing.sm }}>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
                    {title}<Text style={{ color: colors.accent }}> {tail}</Text>
                  </Text>
                  <Card>
                    <View style={{ gap: spacing.sm }}>
                      {items.map((item, index) => (
                        <View
                          key={`${item.name}-${index}`}
                          style={{
                            borderBottomColor: colors.border,
                            borderBottomWidth: index === items.length - 1 ? 0 : 1,
                            gap: 4,
                            paddingBottom: spacing.sm,
                          }}
                        >
                          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{item.name}</Text>
                            {/* Its condition at this move-in (user, 2026-11-07). */}
                            <ItemConditionChip condition={item.condition} />
                          </View>
                          {item.note ? <Text style={[type.description, { color: colors.muted }]}>{item.note}</Text> : null}
                          <View style={{ flexDirection: "row", gap: spacing.sm, paddingTop: 4 }}>
                            {item.photoUrls.map((url, photo) => (
                              <AnimatedPressable
                                accessibilityLabel={`Open photo ${photo + 1} of ${item.name}`}
                                accessibilityRole="imagebutton"
                                key={url}
                                onPress={() => setLightbox({ images: item.photoUrls, index: photo })}
                                style={{ borderRadius: 10, height: 64, overflow: "hidden", width: 64 }}
                              >
                                <Image resizeMode="cover" source={{ uri: url }} style={{ height: "100%", width: "100%" }} />
                              </AnimatedPressable>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  </Card>
                </View>
              );
            })}
          </>
        )}
      </ScreenScrollView>

      {checklist?.canRespond ? (
        <PinnedFooter>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={respondState.isLoading} label="Something is different" onPress={() => setNoting(true)} variant="secondary" />
            <ActionButton disabled={respondState.isLoading} label="Looks right" onPress={() => void answer(true)} />
          </View>
        </PinnedFooter>
      ) : null}

      {noting ? (
        <SheetShell size="short" onClose={() => setNoting(false)} title="What is different?">
          <View style={{ gap: spacing.md }}>
            <FormInput
              error={noteError}
              label="Your note"
              maxLength={500}
              multiline
              onChangeText={(value) => { setNote(value); setNoteError(undefined); }}
              placeholder="e.g. The fan was already broken"
              value={note}
            />
            <View style={{ flexDirection: "row" }}>
              <ActionButton disabled={respondState.isLoading} label="Send note" onPress={() => void answer(false)} />
            </View>
          </View>
        </SheetShell>
      ) : null}

      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
      {lightbox ? <Lightbox images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} /> : null}
    </View>
  );
}

const SECTIONS: { section: "AMENITY" | "BATHROOM" | "ROOM"; title: string; tail: string }[] = [
  { section: "AMENITY", tail: "amenities", title: "Room" },
  { section: "BATHROOM", tail: "bathroom", title: "Attached" },
  { section: "ROOM", tail: "items", title: "Room" },
];

/**
 * A current tenant with no checklist on record (user, 2026-11-11): it counts as
 * accepted, and the room's items show at the level each is at now.
 */
function RoomItemsAccepted({ acceptedOn, items, loading }: { acceptedOn: string | null; items: MyRoomItem[]; loading: boolean }) {
  const { colors, fonts, type } = useTheme();
  if (loading) return <SkeletonCard />;
  return (
    <>
      <AcceptedSummaryCard acceptedOn={acceptedOn} items={items} />
      {items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No items recorded for this room" />
      ) : SECTIONS.map(({ section, tail, title }) => {
        const inSection = items.filter((item) => (item.section ?? "ROOM") === section);
        if (inSection.length === 0) return null;
        return (
          <View key={section} style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18 }}>
              {title}<Text style={{ color: colors.accent }}> {tail}</Text>
            </Text>
            <Card>
              <View style={{ gap: spacing.sm }}>
                {inSection.map((item, index) => (
                  <View
                    key={`${item.itemName}-${index}`}
                    style={{ alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: index === inSection.length - 1 ? 0 : 1, flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm }}
                  >
                    <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>{item.itemName}</Text>
                    {item.level ? <DamageLevelPill level={item.level} /> : <Text style={[type.caption, { color: colors.muted }]}>Not graded</Text>}
                  </View>
                ))}
              </View>
            </Card>
          </View>
        );
      })}
    </>
  );
}

/** The green accepted card and the yellow one waiting on the tenant (user, 2026-11-11). */
const CHECKLIST_TONES = {
  accepted: { border: "#A6F4C5", caption: "#067647", colors: ["#ECFDF3", "#D1FADF"] as const, rule: "#6CE9A6" },
  pending: { border: "#FEDF89", caption: "#B54708", colors: ["#FFFAEB", "#FEF0C7"] as const, rule: "#FEC84B" },
};

/**
 * The checklist's state on a card (user, 2026-11-11): the art, a title and
 * what it means, and below a perforated tear three counts.
 */
function ChecklistStateCard({
  facts,
  message,
  title,
  tone,
}: {
  facts: { label: string; tone?: string; value: string }[];
  message: string;
  title: string;
  tone: keyof typeof CHECKLIST_TONES;
}) {
  const { colors, fonts, type } = useTheme();
  const palette = CHECKLIST_TONES[tone];
  const notch = { backgroundColor: colors.background, borderColor: palette.border, borderRadius: 999, borderWidth: 1, height: 20, position: "absolute", top: -10, width: 20 } as const;
  return (
    <View style={{ borderRadius: radii.card, ...cardShadow(colors.shadow) }}>
      <LinearGradient
        colors={palette.colors}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{ borderColor: palette.border, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 150, padding: spacing.lg }}>
          <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
            <Text style={[type.caption, { color: palette.caption }]}>Move-in record</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, lineHeight: 27 }}>{title}</Text>
            <Text style={[type.caption, { color: colors.inkSoft, lineHeight: 17 }]}>{message}</Text>
          </View>
          <ChecklistArt pending={tone === "pending"} />
        </View>
        {/* The tear line: a dashed rule between two notches cut into the edges. */}
        <View style={{ height: 1 }}>
          <View style={{ borderColor: palette.rule, borderStyle: "dashed", borderTopWidth: 1.5, marginHorizontal: spacing.md }} />
          <View style={[notch, { left: -11 }]} />
          <View style={[notch, { right: -11 }]} />
        </View>
        <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          {facts.map((fact, index) => (
            <FactColumn divided={index > 0} key={fact.label} label={fact.label} tone={fact.tone} value={fact.value} />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

/** A current tenant with no checklist on record: accepted. */
function AcceptedSummaryCard({ acceptedOn, items }: { acceptedOn: string | null; items: MyRoomItem[] }) {
  const { colors } = useTheme();
  const worn = items.filter((item) => item.level === "D2" || item.level === "D3").length;
  return (
    <ChecklistStateCard
      facts={[
        { label: "Items", value: String(items.length) },
        { label: "Worn or damaged", tone: worn > 0 ? colors.warningText : colors.jade, value: String(worn) },
        // Accepted the day they moved in (user, 2026-11-11).
        { label: "Accepted on", value: acceptedOn ? formatDateLong(new Date(`${acceptedOn}T12:00:00+05:30`)) : "-" },
      ]}
      message="You moved in before move-in checklists began, so your room is accepted as it is."
      title="Room items accepted"
      tone="accepted"
    />
  );
}

/** A recorded checklist still waiting on the tenant: review it. */
function PendingReviewCard({ checklist }: { checklist: MoveInChecklist }) {
  const { colors } = useTheme();
  const worn = checklist.items.filter((item) => item.damageLevel === "D2" || item.damageLevel === "D3").length;
  const deadline = formatDateLong(new Date(checklist.respondBy));
  return (
    <ChecklistStateCard
      facts={[
        { label: "Items", value: String(checklist.items.length) },
        { label: "Worn or damaged", tone: worn > 0 ? colors.warningText : colors.jade, value: String(worn) },
        { label: "Answer by", tone: colors.warningText, value: deadline },
      ]}
      message="Check each item against your room and answer below. If you do not answer in time, it counts as accepted."
      title="Review room items"
      tone="pending"
    />
  );
}

/** Where the tenant's answer stands, said once at the top. */
function StatusNotice({ asTenant, checklist }: { asTenant: boolean; checklist: MoveInChecklist }) {
  const deadline = formatDateLong(new Date(checklist.respondBy));
  if (checklist.status === "PENDING") {
    return asTenant ? (
      <PendingReviewCard checklist={checklist} />
    ) : (
      <NoticeBar message={`The tenant has until ${deadline} to accept it or note a difference.`} title="Waiting for the tenant" tone="info" />
    );
  }
  if (checklist.status === "NOTED") {
    return <NoticeBar message={checklist.tenantNote ?? ""} title={asTenant ? "You noted a difference" : "The tenant noted a difference"} tone="warning" />;
  }
  return (
    <NoticeBar
      message={checklist.status === "ACCEPTED_BY_DEFAULT" ? "There was no answer within 48 hours, so it counts as accepted." : asTenant ? "You confirmed the room is as recorded." : "The tenant confirmed the room is as recorded."}
      title="Accepted"
      tone="success"
    />
  );
}

function formatDateLong(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata", year: "numeric" }).format(date);
}
