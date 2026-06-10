import { BellOff } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";

export default function NotificationsScreen() {
  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="In-app feed"
        title="Alerts,"
        italicTail="held for you."
        subtitle="Reminders, billing updates, concern updates, notices and important tenancy events — DB-first, push as a channel on top."
      />

      <EmptyState
        icon={BellOff}
        eyebrow="Quiet for now"
        title="No notifications yet"
        description="Once tenancies and billing are wired in, this feed will fill up with rent reminders, concern updates, and notice alerts."
      />

      <Section eyebrow="Channels" title="Where they arrive">
        <ActionCard
          meta="In-app"
          title="Notification feed"
          description="Backed by notification.notifications and notification_recipients. Mark read, mark all read, archive."
          tone="primary"
        />
        <ActionCard
          meta="Push"
          title="Device tokens"
          description="Register OneSignal / Firebase / log-provider device tokens so push reaches you when the app is closed."
        />
      </Section>
    </ScreenScrollView>
  );
}
