// Key names accepted by tauri-plugin-global-shortcut's parser beyond plain
// single characters (letters/digits/symbols map to themselves uppercased).
const SPECIAL_KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
};

const F_KEY_RE = /^F([1-9]|1[0-9]|2[0-4])$/;

// Builds a tauri-plugin-global-shortcut accelerator string (e.g.
// "CommandOrControl+Shift+O") from a keydown event. Returns null while only
// modifier keys are held (still waiting for the "real" key) or when the
// pressed key isn't one the shortcut backend understands.
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "Shift") {
    return null;
  }

  let key: string;
  if (e.key.length === 1) {
    key = e.key.toUpperCase();
  } else if (SPECIAL_KEY_NAMES[e.key]) {
    key = SPECIAL_KEY_NAMES[e.key];
  } else if (F_KEY_RE.test(e.key)) {
    key = e.key;
  } else {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part))
    .join(" + ");
}
