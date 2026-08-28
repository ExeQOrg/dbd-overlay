import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface MapsSyncState {
  phase: "checking" | "downloading" | "done" | "error";
  current: number;
  total: number;
  error: string | null;
}

const INITIAL_STATE: MapsSyncState = { phase: "checking", current: 0, total: 0, error: null };

// Blocks the main window behind a loading screen while the startup maps
// sync (see sync_maps_with_repo in src-tauri) is checking for/downloading
// updates, so the gallery/detection pages don't render against a map pack
// that's mid-swap. Fails open on error - a bad network shouldn't lock the
// user out of the app, just leave them on whatever maps are already local.
export default function MapsSyncGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MapsSyncState>(INITIAL_STATE);

  useEffect(() => {
    invoke<MapsSyncState>("get_maps_sync_status").then(setState);
    const unlisten = listen<MapsSyncState>("maps-sync-state", (event) => setState(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const blocking = state.phase === "checking" || state.phase === "downloading";
  const showBar = state.phase === "downloading" && state.total > 0;
  const percent = showBar ? Math.round((state.current / state.total) * 100) : 0;

  return (
    <>
      {children}
      {blocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f6f6f6]/95 backdrop-blur-sm dark:bg-[#2f2f2f]/95">
          <div className="flex w-80 flex-col items-center gap-5 rounded-2xl border border-black/10 bg-white px-8 py-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.15)] dark:border-white/10 dark:bg-[#0f0f0f98]">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-[#396cd8]/20 border-t-[#396cd8]" />

            <div className="flex flex-col gap-1">
              <p className="text-base text-[#999] font-semibold">
                {state.phase === "checking" ? "Checking for map updates" : "Downloading maps"}
              </p>
              <p className="text-xs text-[#777]">
                {state.phase === "checking"
                  ? "This only takes a moment…"
                  : "Only happens when the map pack changes - won't take long."}
              </p>
            </div>

            {showBar && (
              <div className="flex w-full flex-col gap-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#396cd8] transition-[width] duration-200 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-[#888]">
                  <span>
                    {state.current} / {state.total} files
                  </span>
                  <span>{percent}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
