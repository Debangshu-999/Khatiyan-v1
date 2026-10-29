import { useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import { FileText } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Lightbox } from "@/components/image-carousel";
import { isDocumentUrl } from "@/features/uploads/upload-limits";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The files of an existing tenant's paper agreement (P1.1, 2026-10-28).
 *
 * <p>When a tenant brought onto Khatiyan keeps their paper agreement, these are
 * the record of what was agreed: no deed is signed in the app. Thumbnails in a
 * row of three. A photo opens full size to read; a PDF opens in the device's
 * own viewer (user, 2026-10-28: the agreement may be a PDF as well).
 */
export function PaperAgreementPhotos({ urls }: { urls: string[] }) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  const images = urls.filter((url) => !isDocumentUrl(url));

  const tile = {
    aspectRatio: 3 / 4,
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: "hidden" as const,
    width: "31%" as const,
  };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {urls.map((url, index) =>
        isDocumentUrl(url) ? (
          <AnimatedPressable
            accessibilityLabel={`Open PDF ${index + 1} of the paper agreement`}
            accessibilityRole="button"
            key={url}
            onPress={() => void Linking.openURL(url)}
            style={{ ...tile, alignItems: "center", gap: spacing.xs, justifyContent: "center" }}
          >
            <FileText color={colors.ink} size={26} strokeWidth={2} />
            <Text style={[type.caption, { color: colors.inkSoft }]}>PDF</Text>
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            accessibilityLabel={`Open page ${index + 1} of the paper agreement`}
            accessibilityRole="imagebutton"
            key={url}
            onPress={() => setOpen(images.indexOf(url))}
            style={tile}
          >
            <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{ uri: url }} style={{ height: "100%", width: "100%" }} />
          </AnimatedPressable>
        ),
      )}
      {open !== null ? <Lightbox images={images} initialIndex={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}
