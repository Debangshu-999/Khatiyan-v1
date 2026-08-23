import { useEffect, useState } from "react";
import { usePathname, useRouter } from "expo-router";

import { ConfirmDialog } from "@/features/owner/owner-ui";
import { clearStoredSession } from "@/auth/session-storage";
import { api } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { sessionExpiryAcknowledged } from "@/store/slices/auth-slice";
import { clearActiveAccount } from "@/store/slices/account-slice";
import { setPinnedOwnerModules } from "@/store/slices/owner-pins-slice";

/**
 * Turns a refused token into a visible, explained sign-out.
 *
 * <p>Before this, an expired session was silent: the token stayed in memory,
 * every request 401'd, and each screen rendered its own "nothing here" state.
 * The app looked broken rather than signed out, and the only way through was a
 * pull-to-refresh that happened to bounce someone to the sign-in screen.
 *
 * <p>Now the first refused request clears the credentials and this says so.
 * The screen already on display keeps its data — there is no value in blanking
 * what someone is reading — but nothing new will load, so the announcement is
 * immediate rather than waiting for a navigation.
 *
 * <p>Mounted once at the root, above the navigator, so it can speak from any
 * screen. Anywhere lower would unmount mid-redirect and take the dialog with
 * it.
 */
export function SessionExpiryGuard() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const expired = useAppSelector((state) => state.auth.sessionExpired);
  // Held locally so the dialog survives the acknowledgement that clears the
  // flag; without it the dialog would dismiss itself before being read.
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (!expired) {
      return;
    }
    setShowing(true);
    dispatch(sessionExpiryAcknowledged());

    // The same teardown a deliberate sign-out performs. Skipping it leaves the
    // next person to sign in inheriting the previous account's cached responses
    // and pinned modules.
    dispatch(api.util.resetApiState());
    dispatch(clearActiveAccount());
    dispatch(setPinnedOwnerModules([]));
    void clearStoredSession();
  }, [dispatch, expired]);

  if (!showing) {
    return null;
  }

  return (
    <ConfirmDialog
      acknowledgeOnly
      confirmLabel="OK"
      message="You have been signed out. Sign in again to carry on."
      // Deliberately inert. `onCancel` is what the Android back button reaches
      // through `onRequestClose`, and the backdrop is not pressable — so OK is
      // the only way out. Letting back dismiss it would leave someone on a
      // screen of stale data with the explanation gone and no way to get it
      // back, which is the state this whole guard exists to end.
      onCancel={() => {}}
      onConfirm={() => {
        setShowing(false);
        // Only if there is somewhere to go. A token can be refused while the
        // sign-in screen is already up — a stale request finishing after a
        // sign-out, say — and replacing a route with itself still runs the
        // stack transition, so the auth screen slid in over the top of itself.
        if (pathname !== "/auth") {
          router.replace("/auth");
        }
      }}
      title="Your session has expired"
    />
  );
}
