package com.khatiyan.d_modules.chat.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.chat.api.dto.ChatContactResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatMessagePageResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatMessageResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatThreadResponse;
import com.khatiyan.d_modules.chat.api.dto.EditChatMessageRequest;
import com.khatiyan.d_modules.chat.api.dto.MarkChatReadRequest;
import com.khatiyan.d_modules.chat.api.dto.SendChatMessageRequest;
import com.khatiyan.d_modules.chat.api.dto.StartDirectChatRequest;
import com.khatiyan.d_modules.chat.service.ChatService;

import jakarta.validation.Valid;

/**
 * REST boundary for chat.
 *
 * <p>The management endpoints take a property because their sections are
 * property-scoped like every other management surface. The counterpart endpoint
 * takes none: a tenant or prospect sees everything they are a member of, across
 * every property, in one list.
 *
 * <p>Reading a conversation is one endpoint with an optional cursor.
 * {@code ?after=} returns only what is new, which is what makes a four-second
 * poll affordable — and is the same call a socket client would use to reconcile
 * after a reconnect, if a socket ever lands.
 */
@RestController
@RequestMapping("/api/v1/chat")
@SuppressWarnings("null")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    // --- Management sections ---

    /** Tenants: a roster of current tenants, whether or not anyone has written. */
    @GetMapping("/properties/{propertyId}/threads/tenants")
    public List<ChatThreadResponse> tenantSection(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return chatService.listTenantSection(user.userId(), propertyId);
    }

    /** My chats: the reader's own one-to-ones on this property. */
    @GetMapping("/properties/{propertyId}/threads/personal")
    public List<ChatThreadResponse> personalSection(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return chatService.listPersonalSection(user.userId(), propertyId);
    }

    /** Enquiries: the conversations this person answered. Private to them. */
    @GetMapping("/properties/{propertyId}/threads/enquiries")
    public List<ChatThreadResponse> enquirySection(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return chatService.listEnquirySection(user.userId(), propertyId);
    }

    /** Who the + button offers, with any existing thread already resolved. */
    @GetMapping("/properties/{propertyId}/contacts")
    public List<ChatContactResponse> contacts(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return chatService.listContacts(user.userId(), propertyId);
    }

    // --- The counterpart's own list ---

    /** Every conversation the caller is a named member of, newest first. */
    @GetMapping("/threads")
    public List<ChatThreadResponse> myThreads(@AuthenticationPrincipal UserPrincipal user) {
        return chatService.listMine(user.userId());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(@AuthenticationPrincipal UserPrincipal user) {
        return Map.of("count", chatService.countUnread(user.userId()));
    }

    // --- Opening ---

    /**
     * Opens the team thread for a stay, creating it if this is the first message.
     *
     * <p>Both sides call this: management from the tenant's roster row, the
     * tenant from their pinned Property Management Team row.
     */
    @PostMapping("/threads/team/{tenancyId}")
    public ChatThreadResponse openTeamThread(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID tenancyId) {
        return chatService.openTeamThreadRow(user.userId(), tenancyId);
    }

    @PostMapping("/threads/direct")
    public ResponseEntity<ChatThreadResponse> openDirectThread(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody StartDirectChatRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                chatService.openDirectThreadRow(user.userId(), request.propertyId(), request.withUserId()));
    }

    // --- Messages ---

    /**
     * A conversation's messages.
     *
     * <p>No {@code after} returns the most recent page. With one, only what
     * arrived since — an indexed lookup that returns an empty list when nothing
     * has, which is the overwhelmingly common poll.
     */
    @GetMapping("/threads/{threadId}/messages")
    public ChatMessagePageResponse messages(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId,
            @RequestParam(required = false) Long after) {
        return chatService.listMessages(user.userId(), threadId, after);
    }

    @PostMapping("/threads/{threadId}/messages")
    public ResponseEntity<ChatMessageResponse> send(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId,
            @Valid @RequestBody SendChatMessageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatService.send(user.userId(), threadId, request));
    }

    /** Rewrites your own message. Text only — see ChatMessage.editBy. */
    @PatchMapping("/threads/{threadId}/messages/{messageId}")
    public ChatMessageResponse editMessage(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId,
            @PathVariable UUID messageId,
            @Valid @RequestBody EditChatMessageRequest request) {
        return chatService.editMessage(user.userId(), threadId, messageId, request.body());
    }

    @DeleteMapping("/threads/{threadId}/messages/{messageId}")
    public ResponseEntity<Void> deleteMessage(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId,
            @PathVariable UUID messageId) {
        chatService.deleteMessage(user.userId(), threadId, messageId);
        return ResponseEntity.noContent().build();
    }

    // --- Read state and closing ---

    @PostMapping("/threads/{threadId}/read")
    public ResponseEntity<Void> markRead(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId,
            @Valid @RequestBody MarkChatReadRequest request) {
        chatService.markRead(user.userId(), threadId, request.lastReadSeq());
        return ResponseEntity.noContent().build();
    }

    /** Ends an enquiry conversation. Either of the two people in it may. */
    @PostMapping("/threads/{threadId}/close")
    public ResponseEntity<Void> close(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId) {
        chatService.closeThread(user.userId(), threadId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Removes a conversation from the caller's own list.
     *
     * <p>DELETE, because that is what it is from the caller's side. Nothing is
     * erased: the other person keeps the whole conversation, and reopening this
     * one starts it empty rather than restoring it.
     */
    @DeleteMapping("/threads/{threadId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteThreadForMe(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID threadId) {
        chatService.deleteThreadForMe(user.userId(), threadId);
    }
}
