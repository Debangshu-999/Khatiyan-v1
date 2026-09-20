import { useEffect, useState } from "react";
import { Redirect } from "expo-router";

import { BrandLoadingScreen } from "@/components/brand-logo";
import { loadAppSettings } from "@/config/app-settings-storage";
import { useAppSelector } from "@/store/hooks";

export default function IndexRoute() {
  const auth = useAppSelector((state) => state.auth);
  const [onboarding, setOnboarding] = useState<"loading" | "seen" | "new">("loading");

  useEffect(() => {
    let mounted = true;
    void loadAppSettings().then((settings) => {
      if (mounted) {
        setOnboarding(settings.hasSeenGetStarted ? "seen" : "new");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!auth.hydrated || onboarding === "loading") {
    return <BrandLoadingScreen />;
  }

  if (auth.accessToken) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href={onboarding === "new" ? "/get-started" : "/auth"} />;
}
