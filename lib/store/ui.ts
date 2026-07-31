"use client";

import { create } from "zustand";
import { DEFAULT_USER_ID, SWITCHABLE_USERS } from "@/lib/current-user";
import type { User } from "@/lib/types";

/**
 * Client-local UI state only. Deals, stages, touchpoints, approvals and the
 * audit timeline are server state and never live here.
 *
 * The rep switcher is a v1 demo affordance — it changes who the Field view
 * and leaderboard treat as "you" without any auth. See lib/current-user.ts.
 */

interface UiState {
  toast: string | null;
  showToast: (text: string) => void;
  clearToast: () => void;

  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  currentUser: () => User;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set, get) => ({
  toast: null,
  showToast: (text) => {
    set({ toast: text });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2900);
  },
  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  currentUserId: DEFAULT_USER_ID,
  setCurrentUserId: (id) => set({ currentUserId: id }),
  currentUser: () =>
    SWITCHABLE_USERS.find((u) => u.id === get().currentUserId) ??
    SWITCHABLE_USERS[0],
}));

/** Convenience for non-React callers (server action result handlers). */
export const toast = (text: string) => useUi.getState().showToast(text);
