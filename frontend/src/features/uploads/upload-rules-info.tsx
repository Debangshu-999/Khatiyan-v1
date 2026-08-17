import { useState } from "react";
import { Text, View } from "react-native";
import { Info } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { InfoModal } from "@/components/info-modal";
import { DOCUMENT_UPLOAD, PHOTO_UPLOAD } from "@/features/uploads/upload-limits";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The "i" beside an upload section, stating what will be accepted.
 *
 * <p>Rules are better read before picking than discovered by rejection — the
 * alternative is choosing eight photos and being told about the ninth.
 */
export function UploadRulesInfo({
  documents = false,
  max,
}: {
  /** Also list the document rules — notices take both. */
  documents?: boolean;
  /** How many files this section accepts, when it is capped. */
  max?: number;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatedPressable
        accessibilityLabel="What can be uploaded"
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => setOpen(true)}
        style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
        tapLockMs={0}
      >
        <Info color={colors.kicker} size={17} strokeWidth={2.4} />
      </AnimatedPressable>

      {open ? (
        <InfoModal onClose={() => setOpen(false)} title="What you can upload">
          {max != null ? <Rule label="How many" value={`Up to ${max} images`} /> : null}
          <Rule label="Photo formats" value={PHOTO_UPLOAD.label} />
          <Rule label="Photo size" value={`Up to ${PHOTO_UPLOAD.maxLabel} each`} />
          {documents ? (
            <>
              <Rule label="Document formats" value={DOCUMENT_UPLOAD.label} />
              <Rule label="Document size" value={`Up to ${DOCUMENT_UPLOAD.maxLabel} each`} />
            </>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Anything outside these is refused at upload, so nothing half-saves.
          </Text>
        </InfoModal>
      ) : null}
    </>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: 2, paddingBottom: spacing.xs }}>
      <Text style={[type.caption, { color: colors.kicker }]}>{label}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{value}</Text>
    </View>
  );
}
