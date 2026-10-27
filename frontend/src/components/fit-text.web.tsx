import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import type { FitTextProps } from "./fit-text";
import { modalTitleFontSize } from "./modal-title-size";

/**
 * React Native Web ignores adjustsFontSizeToFit, so the line is measured in
 * its loaded face and its size set to what fits, as ModalTitle does. It never
 * grows past its own size and never shrinks past the floor, where the
 * ellipsis takes over.
 */
export function FitText({ minimumFontScale = 0.7, numberOfLines = 1, style, ...props }: FitTextProps) {
  const ref = useRef<Text>(null);
  const baseSize = StyleSheet.flatten(style)?.fontSize ?? 14;
  const [fontSize, setFontSize] = useState(baseSize);

  useLayoutEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || numberOfLines !== 1) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    let active = true;
    function fit() {
      if (!active || !node || !context) return;
      const computed = window.getComputedStyle(node);
      context.font = `${computed.fontStyle} ${computed.fontWeight} ${baseSize}px ${computed.fontFamily}`;
      let text = node.textContent ?? "";
      if (computed.textTransform === "uppercase") text = text.toUpperCase();
      if (computed.textTransform === "lowercase") text = text.toLowerCase();
      const tracking = Number.parseFloat(computed.letterSpacing) || 0;
      const naturalWidth = context.measureText(text).width + tracking * Math.max(0, Array.from(text).length - 1);
      const width = node.clientWidth - (Number.parseFloat(computed.paddingLeft) || 0) - (Number.parseFloat(computed.paddingRight) || 0);
      const next = modalTitleFontSize(width, naturalWidth, baseSize, minimumFontScale);
      setFontSize((current) => Math.abs(current - next) < 0.1 ? current : next);
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [baseSize, minimumFontScale, numberOfLines, props.children, style]);

  return <Text {...props} ref={ref} numberOfLines={numberOfLines} style={[style, numberOfLines === 1 ? { fontSize } : null]} />;
}
