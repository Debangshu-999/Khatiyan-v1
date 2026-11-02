import { createContext, useContext } from "react";

/**
 * True inside a centre dialog (2026-10-29). Centre dialogs keep their own
 * look, ink title, no line under it, their x (user: "Revert the center dialog
 * box modal changes"). Bottom sheets take the blue title and the line.
 */
export const CenterDialogContext = createContext(false);

export function useInCenterDialog() {
  return useContext(CenterDialogContext);
}
