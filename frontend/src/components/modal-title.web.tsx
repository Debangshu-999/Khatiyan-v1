import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";

import type { ModalTitleProps } from "./modal-title";
import { modalTitleFontSize } from "./modal-title-size";

/** React Native Web ignores adjustsFontSizeToFit, so measure the loaded face. */
export function ModalTitle({ style, minimumFontScale = 0.65, ...props }: ModalTitleProps) {
  const ref = useRef<Text>(null);
  const baseSize = StyleSheet.flatten(style)?.fontSize ?? 22;
  const [fontSize, setFontSize] = useState(baseSize);

  useLayoutEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
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
    // Font loading and viewport/parent resizing must both refit the same title.
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [baseSize, minimumFontScale, props.children, style]);

  return <Text
    accessibilityRole="header"
    {...props}
    ref={ref}
    numberOfLines={1}
    style={[style, { flexShrink: 1, fontSize, maxWidth: "80%", minWidth: 0, width: "80%" }]}
  />;
}
