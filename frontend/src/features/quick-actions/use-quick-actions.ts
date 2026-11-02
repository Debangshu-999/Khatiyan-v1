import { useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useGetMyPropertyPermissionsQuery, useListMyPropertiesQuery } from "@/store/services/property-api";
import { permittedQuickActions, quickActionRoute, type QuickAction } from "./catalogue";
import { recordQuickActionUse, recordSearchPick, useRecentQuickActions, useRecentSearchPicks } from "./recent-actions";

type QuickActionScope = { userId: string; propertyId: string; role: "owner" | "manager" };

export function useQuickActionsScope(enabled = true) {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const token = useAppSelector((state) => state.auth.accessToken);
  const account = useAppSelector((state) => state.account.activeAccount);
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const workspace = enabled && (account === "owner" || account === "manager");
  const properties = useListMyPropertiesQuery(undefined, { skip: !token || !workspace });
  // No first-property fallback: a shortcut must act on the property visibly selected on Home.
  const property = workspace ? properties.currentData?.find((item) => item.id === propertyId && item.active
    && (account === "owner" ? item.ownerId === userId : item.ownerId !== userId)) : undefined;
  const permissions = useGetMyPropertyPermissionsQuery(property?.id ?? "", { skip: !property, refetchOnFocus: true });
  const grants = permissions.currentData?.propertyId === property?.id ? permissions.currentData : undefined;
  const actions = useMemo(() => property && userId ? permittedQuickActions(grants, account === "owner" && property.ownerId === userId) : [], [property, userId, grants, account]);
  const scope: QuickActionScope | null = property && userId && workspace ? { userId, propertyId: property.id, role: account } : null;
  return {
    actions, property, scope,
    loading: Boolean(token && workspace && (properties.isLoading || (property && !grants && !permissions.isError))),
    error: properties.isError || permissions.isError,
    retry: () => { if (properties.isError) void properties.refetch(); else if (property) void permissions.refetch(); },
  };
}

export function useQuickActions() {
  const model = useQuickActionsScope();
  const router = useGuardedRouter();
  const userId = model.scope?.userId;
  // What this person uses most, among what they may use here (2026-10-29).
  const used = useRecentQuickActions(userId);
  const recent = useMemo(() => used.filter((id) => model.actions.some((action) => action.id === id)), [used, model.actions]);
  // Results chosen from search, most recent first, among what they may use here.
  const picked = useRecentSearchPicks(userId);
  const searchPicks = useMemo(() => picked.filter((id) => model.actions.some((action) => action.id === id)), [picked, model.actions]);
  const lastLaunch = useRef(0);
  useFocusEffect(useCallback(() => { lastLaunch.current = 0; }, []));
  const launch = useCallback((action: QuickAction, routeOverride?: string) => {
    const permitted = model.actions.find((candidate) => candidate.id === action.id);
    if (!permitted || !model.scope || !model.property) return;
    const now = Date.now();
    if (lastLaunch.current && now - lastLaunch.current < 650) return;
    lastLaunch.current = now;
    void recordQuickActionUse(model.scope.userId, permitted.id);
    const route = quickActionRoute(permitted, model.property.id, routeOverride);
    router.push({ ...route, params: { ...route.params, quickRun: String(now) } } as never);
  }, [model.actions, model.property, model.scope, router]);
  /** A result chosen from search: remembered for Recent searches, then launched. */
  const launchFromSearch = useCallback((action: QuickAction) => {
    if (model.scope) void recordSearchPick(model.scope.userId, action.id);
    launch(action);
  }, [launch, model.scope]);
  return { ...model, launch, launchFromSearch, recent, searchPicks };
}
