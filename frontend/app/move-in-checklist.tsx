import { useState } from "react";
import { Image, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ClipboardList } from "lucide-react-native";

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
import { DamageLevelInfo, DamageLevelPill } from "@/features/tenancy/damage-level";
import { useGetMoveInChecklistQuery, useRespondMoveInChecklistMutation, type MoveInChecklist } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
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

            {/* What each level means at this property (user, 2026-10-29). */}
            <View style={{ alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: spacing.xs }}>
              <Text style={[type.caption, { color: colors.muted }]}>Damage levels</Text>
              <DamageLevelInfo levels={checklist.levels} />
            </View>

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
                            <DamageLevelPill level={item.damageLevel} />
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
        <SheetShell onClose={() => setNoting(false)} title="What is different?">
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

/** Where the tenant's answer stands, said once at the top. */
function StatusNotice({ asTenant, checklist }: { asTenant: boolean; checklist: MoveInChecklist }) {
  const deadline = formatDateLong(new Date(checklist.respondBy));
  if (checklist.status === "PENDING") {
    return asTenant ? (
      <NoticeBar message={`Check it against the room and answer by ${deadline}. Unanswered, it counts as accepted.`} title="Waiting for your answer" tone="warning" />
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
