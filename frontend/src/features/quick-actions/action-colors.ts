import type { QuickAction } from "./catalogue";

export type QuickActionColors = { ink: string; fill: string; border: string };
const LIGHT: QuickActionColors = { ink: "#235DB8", fill: "#EDF4FF", border: "#D6E6FF" };
const DARK: QuickActionColors = { ink: "#9BBEFF", fill: "#172945", border: "#29456B" };

/** Every action uses the Move in booking blue, on Home, in category grids and in search. */
export function quickActionColors(_action: Pick<QuickAction, "id" | "category">, isDark = false): QuickActionColors {
  return isDark ? DARK : LIGHT;
}
