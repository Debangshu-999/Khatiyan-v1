import { Children, cloneElement, Fragment, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";

/** Drawn over the sheet rather than in it, so one after the button does not stop the button moving. */
const FLOATS_OVER_THE_SHEET = /(Modal|Dialog|Sheet|DateTimePicker)$/;

type Parts = { ActionButton: ComponentType<never>; View: unknown };
type Element = ReactElement<{ children?: ReactNode; style?: unknown }>;

/** Fragments opened out, each child keeping a key of its own so typed text and focus survive. */
function flatten(children: ReactNode, parentKey = "sheet"): ReactNode[] {
  return Children.toArray(children).flatMap((child, index) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [child];
    const key = `${parentKey}/${child.key ?? index}`;
    return child.type === Fragment ? flatten(child.props.children, key) : [cloneElement(child, { key })];
  });
}

function floatsOver(child: ReactNode) {
  if (!isValidElement(child)) return false;
  const type = child.type as { displayName?: string; name?: string } | string;
  const name = typeof type === "string" ? "" : type.displayName ?? type.name ?? "";
  return FLOATS_OVER_THE_SHEET.test(name);
}

/** A button, or a plain view holding nothing but buttons. */
function isAction(child: Element, parts: Parts): boolean {
  if (child.type === parts.ActionButton) return true;
  if (child.type !== parts.View) return false;
  const inside = flatten(child.props.children);
  return inside.length > 0 && inside.every((item) => isValidElement(item) && isAction(item as Element, parts));
}

function laysOutInARow(child: Element) {
  const styles = [child.props.style].flat(Infinity) as ({ flexDirection?: string } | null | undefined)[];
  return styles.some((style) => style?.flexDirection === "row");
}

function lift(items: ReactNode[], parts: Parts): { body: ReactNode[]; footer: ReactNode[] } {
  const inFlow = items.filter((child) => !floatsOver(child));
  const onlyChild = inFlow.length === 1 ? inFlow[0] : null;

  // The sheet's whole content in one wrapper, as most forms are: look inside it.
  // Only then, and never into a row: a button at the end of a list row, or beside
  // the field it acts on, belongs where it is.
  if (isValidElement(onlyChild) && onlyChild.type === parts.View && !isAction(onlyChild as Element, parts) && !laysOutInARow(onlyChild as Element)) {
    const inner = lift(flatten((onlyChild as Element).props.children, String(onlyChild.key)), parts);
    if (inner.footer.length === 0) return { body: items, footer: [] };
    const emptied = cloneElement(onlyChild as Element, { children: inner.body });
    return { body: items.map((child) => (child === onlyChild ? emptied : child)), footer: inner.footer };
  }

  const footer: ReactNode[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const child = items[index];
    if (floatsOver(child)) continue;
    if (!isValidElement(child) || !isAction(child as Element, parts)) break;
    footer.unshift(child);
  }
  const lifted = new Set(footer);
  const body = items.filter((child) => !lifted.has(child));
  // Nothing but buttons is a list of choices, not a form with a Save. It stays.
  if (body.every(floatsOver)) return { body: items, footer: [] };
  return { body, footer };
}

/**
 * Lifts the buttons that end a bottom sheet's content into its fixed footer (user,
 * 2026-11-01, every bottom-up sheet, filter sheets included), so its Save stays in
 * view while the body scrolls.
 *
 * <p>Done here rather than in each of the app's sheets, so a new sheet gets it too.
 * Reads from the end: dialogs drawn over this sheet are stepped over, then the run of
 * buttons is taken. Anything else stops it, so a button mid-form stays where it is.
 */
export function splitSheetFooter(children: ReactNode, parts: Parts): { body: ReactNode[]; footer: ReactNode[] } {
  return lift(flatten(children), parts);
}
