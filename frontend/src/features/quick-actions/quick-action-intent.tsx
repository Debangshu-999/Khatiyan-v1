import { useCallback, useRef } from "react";
import { useFocusEffect, useLocalSearchParams, usePathname } from "expo-router";
import { findQuickAction, isQuickActionDestination } from "./catalogue";
import { useQuickActionsScope } from "./use-quick-actions";

/** Only the selected property, permitted action and its supported destinations may consume an intent. */
function usePermittedIntent() {
  const params = useLocalSearchParams<{ quickAction?: string; quickPropertyId?: string }>();
  const pathname = usePathname();
  const model = useQuickActionsScope(Boolean(params.quickAction));
  const action = findQuickAction(params.quickAction);
  return action && params.quickPropertyId === model.property?.id && isQuickActionDestination(action, pathname)
    && model.actions.some((candidate) => candidate.id === action.id) ? action : undefined;
}

/** Opens an existing FORM once; callbacks must never submit or mutate data. */
export function useQuickActionIntent(handlers: Record<string, (() => void) | undefined>, ready = true, recordKey = "form") {
  const params = useLocalSearchParams<{ quickPropertyId?: string; quickRun?: string }>();
  const action = usePermittedIntent();
  const handled = useRef<string | null>(null);
  const handler = action ? handlers[action.id] : undefined;
  const key = action ? `${params.quickPropertyId}:${params.quickRun ?? ""}:${action.id}:${recordKey}` : null;
  useFocusEffect(useCallback(() => {
    if (!ready || !handler || !key || handled.current === key) return;
    handled.current = key;
    handler();
  }, [handler, key, ready]));
}

