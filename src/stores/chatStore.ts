/**
 * Chat Store — persists multiple chat conversations in localStorage.
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
};

type ChatStoreActions = {
  newConversation: (schemaName: string) => string;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;
  addMessage: (convId: string, msg: ChatEntry) => void;
  renameConversation: (id: string, title: string) => void;
  clearAll: () => void;
  getActiveMessages: () => ChatEntry[];
};

export type ChatStore = ChatStoreState & ChatStoreActions;

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,

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
                  // Auto-title from first user message
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
      name: 'ai-schema-chat-history',
      partialize: (s) => ({
        conversations: s.conversations,
        activeConversationId: s.activeConversationId,
      }),
    },
  ),
);
