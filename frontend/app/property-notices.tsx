import { useState } from "react";

import { loadFailure, LoadFailed } from "@/components/load-failed";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { PropertyBoardScreenSkeleton } from "@/components/skeletons/property-board";
import {
  NoticeBoardHero,
  NoNoticesNote,
  NoticeCard,
  noticeGroupLabel,
  sortNoticesNewestFirst,
} from "@/features/notice/notice-board-ui";
import { PropertyBoardItemModal } from "@/features/property-board/property-board-ui";
import type { NoticeSummary } from "@/store/services/notice-api";
import { useListMyVisibleNoticesQuery } from "@/store/services/notice-api";


/**
 * The tenant's notice board, built like the property board's screen (user,
 * 2026-11-10): the banner, then every notice newest first, each card carrying
 * its own priority and date (user, 2026-11-15), each opening in full. The blue board and the megaphone where the board has its cork.
 */
export default function PropertyNoticesScreen() {
  // Checked every minute and on return, so a notice that goes live shows without a reload (user, 2026-11-14).
  const noticesQuery = useListMyVisibleNoticesQuery(undefined, { pollingInterval: 60_000, refetchOnFocus: true });
  const notices = sortNoticesNewestFirst(noticesQuery.data ?? []);
  const [selected, setSelected] = useState<NoticeSummary | null>(null);
  const failed = loadFailure(noticesQuery);

  return (
    <>
      <ScreenScrollView
        contentContainerStyle={{ paddingBottom: 0 }}
        onRefresh={async () => {
          await noticesQuery.refetch();
        }}
      >
        <ScreenHeader italicTail="board." title="Notice" />
        <NoticeBoardHero />

        {noticesQuery.isFetching && !noticesQuery.data ? (
          <PropertyBoardScreenSkeleton />
        ) : failed ? (
          <LoadFailed error={failed.error} onReload={failed.reload} />
        ) : notices.length > 0 ? (
          notices.map((notice) => <NoticeCard key={notice.id} notice={notice} onSelect={setSelected} />)
        ) : (
          // The same blank taped notice as Home's board (user, 2026-11-10).
          <NoNoticesNote />
        )}
      </ScreenScrollView>

      <PropertyBoardItemModal
        item={selected ? { body: selected.body, categoryName: `${noticeGroupLabel(selected.priority)} notice`, title: selected.title } : null}
        onClose={() => setSelected(null)}
        // Just the notice: no megaphone, no "Important notice" over its title (user, 2026-11-13).
        plain
      />
    </>
  );
}
