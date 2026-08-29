import { useState, type ReactNode } from "react";
import { panelClass } from "../lib/Styles";

export default function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`w-full overflow-hidden ${panelClass}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-display text-sm uppercase tracking-wide text-ink"
      >
        <span>{title}</span>
        <span className={`text-blood transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="border-t border-ink/10 px-4 py-5">{children}</div>}
    </div>
  );
}
