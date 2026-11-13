import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { currentPerson, initialState, transition, type Action, type State } from "./model";
import { parseState, readState, saveState, STORAGE_KEY, type StoragePort } from "./storage";
function browserStorage(): StoragePort | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function useStore() {
  const [loaded] = useState(() => readState(browserStorage()));
  const [state, setState] = useState(loaded.state);
  const [issue, setIssue] = useState(loaded.issue);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(loaded.blocked);
  const latest = useRef(state);
  function commit(next: State, replace = false) {
    latest.current = next;
    setState(next);
    setError("");
    if (blocked && !replace) return;
    try {
      saveState(browserStorage(), next);
      setIssue("");
      if (replace) setBlocked(false);
    } catch (e) {
      setIssue((e as Error).message);
    }
  }
  function run(action: Action) {
    try {
      commit(transition(latest.current, action));
      return true;
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Sprawdź poprawność i długość wprowadzonych danych.",
      );
      return false;
    }
  }
  function importState(raw: string) {
    try {
      const next = parseState(raw);
      commit(next, true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);
  // Another tab of this browser (e.g. the expert link in an E03 session) saved new state.
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue || blocked) return;
      try {
        const next = parseState(event.newValue);
        latest.current = next;
        setState(next);
      } catch {
        // Ignore unreadable writes from other tabs; this tab keeps its valid state.
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [blocked]);
  return {
    state,
    issue,
    error,
    blocked,
    original: loaded.original,
    run,
    importState,
    clearError: () => setError(""),
    reset: () => commit(initialState(), true),
  };
}
type Store = ReturnType<typeof useStore>;
const Context = createContext<Store | null>(null);
// Personas are shared synthetic profiles, so many real visitors pick the same one.
// Identifying by persona would merge them into one PostHog person; record only the
// simulated role as an event property.
function PostHogRole({ state }: { state: State }) {
  const posthog = usePostHog();
  const role = currentPerson(state)?.role ?? "visitor";

  useEffect(() => {
    posthog.register({ simulated_role: role });
  }, [role, posthog]);

  return null;
}
export function PrototypeProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return (
    <Context.Provider value={store}>
      <PostHogRole state={store.state} />
      {children}
    </Context.Provider>
  );
}
export function usePrototype() {
  const store = useContext(Context);
  if (!store) throw new Error("PrototypeProvider is required");
  return store;
}
