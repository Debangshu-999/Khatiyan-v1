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
 * <p>Now the first refused request clears the credentials, sends the person to
 * the sign-in screen, and says why once they are there. The dialog used to open
 * over whatever screen they were on and only navigate once dismissed — which
 * left it floating above a workspace full of data that no longer loaded, and
 * made "OK" read as an acknowledgement rather than the thing that moved them.
 * Signed out means signed out, and the screen behind the message should be the
 * one they are being sent to.
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

    // Straight to sign-in, with the message following them there. Only if there
    // is somewhere to go: a token can be refused while the sign-in screen is
    // already up — a stale request finishing after a sign-out, say — and
    // replacing a route with itself still runs the stack transition, so the auth
    // screen slid in over the top of itself.
    if (pathname !== "/auth") {
      router.replace("/auth");
    }
  }, [dispatch, expired, pathname, router]);

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
      // Nothing but dismissal left to do — the navigation has already happened,
      // so OK closes the message on the screen it was always going to end on.
      onConfirm={() => setShowing(false)}
      title="Your session has expired"
    />
  );
}
