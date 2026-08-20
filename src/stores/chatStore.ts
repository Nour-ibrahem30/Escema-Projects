/**
 * Chat Store — persists multiple chat conversations in localStorage.
 * Data is isolated per user — on sign-out all conversations are wiped.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '../utils/id';
import type { ChatMessage } from '../ai/chat';

export type ChatEntry = ChatMessage & {
  patches?: number;
  failedPatches?: number;
  modelUsed?: string;
  ts: number;
};

export type Conversation = {
  id: string;
  title: string;
  schemaName: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatEntry[];
};

type ChatStoreState = {
  conversations: Conversation[];
  activeConversationId: string | null;
  /** userId whose conversations are currently loaded */
  loadedUserId: string | null;
};

type ChatStoreActions = {
  newConversation: (schemaName: string) => string;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;
  addMessage: (convId: string, msg: ChatEntry) => void;
  renameConversation: (id: string, title: string) => void;
  clearAll: () => void;
  getActiveMessages: () => ChatEntry[];
  /** Call on user switch — loads conversations for this user (clears if different user) */
  initForUser: (userId: string) => void;
  /** Call on sign-out — wipes localStorage and resets state */
  resetForSignOut: () => void;
};

export type ChatStore = ChatStoreState & ChatStoreActions;

const STORAGE_KEY = 'ai-schema-chat-history';

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      loadedUserId: null,

      initForUser: (userId) => {
        // If a different user's data is in memory — clear it
        if (get().loadedUserId && get().loadedUserId !== userId) {
          localStorage.removeItem(STORAGE_KEY);
          set({ conversations: [], activeConversationId: null, loadedUserId: userId });
        } else {
          // Same user or first load — just mark the userId
          set({ loadedUserId: userId });
        }
      },

      resetForSignOut: () => {
        localStorage.removeItem(STORAGE_KEY);
        set({ conversations: [], activeConversationId: null, loadedUserId: null });
      },

      newConversation: (schemaName) => {
        const id   = generateId();
        const conv: Conversation = {
          id,
          title: `Chat — ${schemaName}`,
          schemaName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      deleteConversation: (id) => {
        set((s) => {
          const remaining = s.conversations.filter((c) => c.id !== id);
          const nextActive =
            s.activeConversationId === id
              ? (remaining[0]?.id ?? null)
              : s.activeConversationId;
          return { conversations: remaining, activeConversationId: nextActive };
        });
      },

      selectConversation: (id) => set({ activeConversationId: id }),

      addMessage: (convId, msg) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, msg],
                  updatedAt: Date.now(),
                  title:
                    c.messages.length === 0 && msg.role === 'user'
                      ? msg.content.slice(0, 40) + (msg.content.length > 40 ? '…' : '')
                      : c.title,
                }
              : c,
          ),
        }));
      },

      renameConversation: (id, title) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title } : c,
          ),
        }));
      },

      clearAll: () => set({ conversations: [], activeConversationId: null }),

      getActiveMessages: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId)?.messages ?? [];
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        conversations:        s.conversations,
        activeConversationId: s.activeConversationId,
        loadedUserId:         s.loadedUserId,
      }),
    },
  ),
);
