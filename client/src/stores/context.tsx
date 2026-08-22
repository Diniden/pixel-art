/**
 * React context, Provider and typed hooks for the MobX store tree (task 14).
 *
 * The `ApplicationStore` is constructed once in `main.tsx` and passed in —
 * never created here, never a module singleton. `useStores` throws when no
 * provider is mounted so a mis-wired tree fails loudly instead of reading
 * stale state.
 *
 * Per-child hooks are added by the tasks that create those children:
 * `session` (task 14), `domain` (task 16); `useUIStore` / `useHistoryStore`
 * arrive with tasks 24 and 17.
 *
 * NOTE: this file is `context.tsx` (the task spec names it `context.ts`)
 * because `StoreProvider` renders JSX.
 */
/* eslint-disable react-refresh/only-export-components -- a context module
   deliberately exports the Provider component AND its hooks together; the
   pairing is the API. HMR of this file reloads the tree, which is correct —
   the store instance lives in main.tsx, not here. */
import { createContext, useContext, type ReactNode } from "react";
import type { ApplicationStore } from "./ApplicationStore";
import type { DomainStore } from "./domain/DomainStore";
import type { SessionStore } from "./session/SessionStore";

const StoreContext = createContext<ApplicationStore | null>(null);

export function StoreProvider({
  store,
  children,
}: {
  store: ApplicationStore;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

/** The whole tree. Throws when rendered outside a `StoreProvider`. */
export function useStores(): ApplicationStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useStores must be used inside <StoreProvider>");
  }
  return store;
}

export const useSessionStore = (): SessionStore => useStores().session;

export const useDomainStore = (): DomainStore => useStores().domain;
