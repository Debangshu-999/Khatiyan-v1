import { View } from "react-native";

import { SkeletonBoundary } from "@/components/skeletons/boundary";
import { ThreadRow } from "@/features/chat/thread-row";
import type { ChatThread } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";

/**
 * The chat list, waiting.
 *
 * <p>The real rows, ghosted, rather than one bordered card. A single card stood
 * in for a list of conversations, reserved a fraction of the height that then
 * arrived, and drew a heavy frame the loaded list does not have. These are
 * ThreadRow itself inside a SkeletonBoundary, edge to edge like the real list,
 * so the page keeps its shape when the conversations land.
 *
 * <p>Enough rows to reach the fold on a phone and no more.
 */
export function ChatThreadListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <SkeletonBoundary>
      <View style={{ marginHorizontal: -spacing.lg }}>
        {SAMPLE_THREADS.slice(0, rows).map((thread) => (
          <ThreadRow key={thread.originId} onPress={noop} thread={thread} />
        ))}
      </View>
    </SkeletonBoundary>
  );
}

function noop() {}

// Sample text only sets how long each bar is. None of it is ever shown.
const SAMPLE_ROWS: Array<[string, string]> = [
  ["Sunrise PG management", "Your rent receipt for this month is ready"],
  ["Rahul", "Is the room still available?"],
  ["Ashirvad Home Stays", "Thanks, see you tomorrow"],
  ["Priya Sen", "The water heater is fixed now"],
  ["Sky Prime PG", "Please share your ID proof"],
  ["Arjun", "Ok"],
  ["Meera Das", "Can I visit on Saturday morning?"],
];

const SAMPLE_THREADS: ChatThread[] = SAMPLE_ROWS.map(([title, preview], index) => ({
  counterpartLastReadSeq: 0,
  counterpartPhotoUrl: null,
  counterpartUserId: `sample-${index}`,
  id: null,
  kind: "DIRECT",
  lastMessageAt: "2026-01-01T09:00:00Z",
  lastMessageKind: null,
  lastMessagePreview: preview,
  lastMessageSeq: 1,
  origin: "PERSONAL",
  originId: `sample-${index}`,
  propertyId: "sample",
  status: "OPEN",
  title,
  unread: false,
}));
