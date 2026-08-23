import { useCallback, useEffect, useRef, useState } from "react";

import {
  CHAT_LIVE_OPTIONS,
  MESSAGE_POLL_MS,
  POLL_LOOKBACK,
  useGetChatMessagesQuery,
  useMarkChatReadMutation,
  type ChatMessage,
  type ChatThread,
  type ChatThreadReader,
} from "@/store/services/chat-api";

/**
 * A conversation, kept current.
 *
 * <p>Holds the merged message list, the poll cursor and the read mark. The
 * merging is the whole point: the server is asked for a WINDOW rather than for
 * everything after the newest message held, so the same messages arrive
 * repeatedly and have to be reconciled by id.
 */
export function useChatMessages(threadId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readers, setReaders] = useState<ChatThreadReader[]>([]);
  /**
   * Where the reader was when they arrived.
   *
   * <p>Captured once, in a ref, because the very next thing this hook does is
   * report the messages as read — so the server's answer is stale within a beat
   * and re-reading it would move the "unread from here" line up to the bottom
   * as you watch.
   */
  const arrivedAtRef = useRef<number | null>(null);
  const [markRead] = useMarkChatReadMutation();

  /**
   * The highest seq rendered. Not the same as the read mark: this is what the
   * client HAS, while the read mark is what the reader has SEEN.
   */
  const highestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0;

  /**
   * Deliberately behind the newest message.
   *
   * <p>A sequence number is taken when a message is inserted but the row only
   * becomes visible when its transaction commits, and those orders are
   * independent — so 812 can appear before 811. Asking for everything after 812
   * would step over 811 permanently, with no error and no gap the client could
   * detect. Asking for a window instead means the straggler is picked up on the
   * next poll and merged into place.
   */
  const cursor = highestSeq > 0 ? Math.max(0, highestSeq - POLL_LOOKBACK) : undefined;

  const page = useGetChatMessagesQuery(
    { after: cursor, threadId },
    { ...CHAT_LIVE_OPTIONS, pollingInterval: MESSAGE_POLL_MS, skip: !threadId },
  );

  useEffect(() => {
    const data = page.data;
    if (!data) {
      return;
    }

    if (arrivedAtRef.current === null) {
      arrivedAtRef.current = data.viewerLastReadSeq;
    }
    setReaders(data.readers);
    setMessages((current) => merge(current, data.messages));
  }, [page.data]);

  /** Anything the reader has now seen, reported once per new high-water mark. */
  const reportedRef = useRef(0);
  useEffect(() => {
    if (!threadId || highestSeq <= reportedRef.current) {
      return;
    }
    reportedRef.current = highestSeq;
    void markRead({ lastReadSeq: highestSeq, threadId });
  }, [highestSeq, markRead, threadId]);

  /**
   * How many people on the other side have read a given message.
   *
   * <p>Derived rather than stored: each reader's position is a high-water mark,
   * so "who saw message 47" is everyone whose mark reaches 47.
   */
  const seenCountFor = useCallback(
    (seq: number) => readers.filter((reader) => reader.lastReadSeq >= seq).length,
    [readers],
  );

  /** Adds a message the client just sent, before any poll could carry it. */
  const append = useCallback((message: ChatMessage) => {
    setMessages((current) => merge(current, [message]));
  }, []);

  return {
    append,
    error: page.isError,
    loading: page.isLoading && messages.length === 0,
    messages,
    readers,
    seenCountFor,
    thread: (page.data?.thread ?? null) as ChatThread | null,
    /** Everything above this the reader had already seen. */
    unreadFrom: arrivedAtRef.current,
  };
}

/**
 * Combines a page into what is already held, by id, ordered by seq.
 *
 * <p>Keyed on id rather than seq because a message can arrive twice — once from
 * the send response and again from the poll that follows — and because the
 * lookback window guarantees repeats. Later copies win, so an edit to a
 * message's state (a deletion) replaces the stale one.
 */
function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => left.seq - right.seq);
}
