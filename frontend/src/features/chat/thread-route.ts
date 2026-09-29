import type { ChatThread } from "@/store/services/chat-api";

/**
 * The route that opens one conversation, carrying its own header text.
 *
 * <p>Passed as params rather than refetched on the other side: the caller
 * already knows the title, and a header that arrives a beat after the screen
 * reads as a flicker on every open.
 *
 * <p>Shared so a screen outside Chats (a tenant's verification card sending
 * them to the property team) opens a thread the same way the Chats tab does.
 */
export function threadRoute(
  threadId: string,
  thread: Pick<ChatThread, "counterpartPhotoUrl" | "counterpartUserId" | "kind" | "title">,
  subtitle?: string | null,
  /** Put in the message box, unsent, for the person to edit or send. */
  draft?: string,
) {
  const query = new URLSearchParams({ title: thread.title });
  if (subtitle) {
    query.set("subtitle", subtitle);
  }
  if (draft) {
    query.set("draft", draft);
  }
  if (thread.counterpartPhotoUrl) {
    query.set("photo", thread.counterpartPhotoUrl);
  }
  // Only when the other side is the PROPERTY. Management opening a tenant's
  // team thread is looking at a person, and flashing a building for one frame
  // before the server answers is a wrong first impression of whose chat it is.
  if (thread.kind === "TEAM" && thread.counterpartUserId === null) {
    query.set("team", "1");
  }
  return `/chat/${threadId}?${query.toString()}`;
}
