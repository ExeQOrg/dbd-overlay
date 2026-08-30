import { useDetection } from "../lib/DetectionContext";
import { formatAccelerator } from "../lib/Shortcut";
import { pageClass, primaryButtonClass, panelClass } from "../lib/Styles";
import PageHeading from "../components/PageHeading";

export default function MapDetectionPage() {
  const { settings, scanning, lastTexts, lastMatch, scanDuration, previews, error, scanNow } = useDetection();

  return (
    <main className={pageClass}>
      <PageHeading>Map Detection</PageHeading>

      <button
        onClick={() => scanNow()}
        disabled={scanning}
        className={`mb-2 ${primaryButtonClass} disabled:opacity-60`}
      >
        {scanning ? "Scanning…" : "Scan Now"}
      </button>
      <p className="mb-6 text-xs text-ink/70">
        Or press {formatAccelerator(settings.scanShortcut)} anytime, even while the game is focused.
      </p>

      <div className="flex w-full max-w-[360px] flex-col gap-6 text-left">
        <div className={`flex flex-col gap-2 p-4 text-left font-mono text-sm text-ink ${panelClass}`}>
          <div>
            <span className="font-sans font-medium">Matched map: </span>
            {lastMatch ?? "No match"}
          </div>
          {error && <div className="text-blood">{error}</div>}
        </div>

        {scanDuration !== null && (
          <p className="font-mono text-xs text-ink/70">Scan took {Math.round(scanDuration)} ms</p>
        )}

        {previews.length > 0 && (
          <div className="flex flex-col gap-5">
            {previews.map((preview, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <span className="text-sm font-medium text-ink">Region {index + 1}</span>
                <img
                  src={preview}
                  alt={`Scan region ${index + 1} preview`}
                  className="max-w-full rounded border border-ink/15"
                />
                <p className="w-full font-mono text-xs text-ink/70">{lastTexts[index] || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
