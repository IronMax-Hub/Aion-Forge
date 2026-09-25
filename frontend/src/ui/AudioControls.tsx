import { useState, useCallback } from "react";
import { audioEngine } from "../audio";
import type { AudioPreferences } from "../audio";

interface Props {
  onFirstInteraction: () => void;
}

export function AudioControls({ onFirstInteraction }: Props) {
  const [prefs, setPrefs] = useState<AudioPreferences>(() => audioEngine.getPrefs());
  const [expanded, setExpanded] = useState(false);

  const update = useCallback((partial: Partial<AudioPreferences>) => {
    onFirstInteraction();
    audioEngine.setPrefs(partial);
    setPrefs(audioEngine.getPrefs());
  }, [onFirstInteraction]);

  const toggleMute = () => update({ muted: !prefs.muted });

  return (
    <div className="audio-controls">
      <button
        className={`audio-mute-btn${prefs.muted ? " muted" : ""}`}
        onClick={toggleMute}
        aria-pressed={!prefs.muted}
        title={prefs.muted ? "Turn sound on" : "Turn sound off"}
      >
        {prefs.muted ? "Sound off" : "Sound on"}
      </button>

      <button
        className="audio-expand-btn"
        onClick={() => setExpanded((v) => !v)}
        aria-label="Sound settings"
        aria-expanded={expanded}
        title="Sound settings"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M2 4h7M12 4h2M2 12h2M7 12h7" />
          <circle cx="10.5" cy="4" r="1.6" />
          <circle cx="5.5" cy="12" r="1.6" />
        </svg>
      </button>

      {expanded && (
        <div className="audio-panel">
          <div className="section-title" style={{ marginBottom: "var(--sp-3)" }}>Sound</div>

          <VolumeRow
            label="Master"
            value={prefs.masterVolume}
            onChange={(v) => update({ masterVolume: v })}
          />
          <VolumeRow
            label="Ambience"
            value={prefs.ambientVolume}
            onChange={(v) => update({ ambientVolume: v })}
          />
          <VolumeRow
            label="Discovery"
            value={prefs.discoveryVolume}
            onChange={(v) => update({ discoveryVolume: v })}
          />
          <VolumeRow
            label="Interface"
            value={prefs.interfaceVolume}
            onChange={(v) => update({ interfaceVolume: v })}
          />
        </div>
      )}
    </div>
  );
}

function VolumeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="audio-vol-row">
      <span className="data-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        className="audio-slider"
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${label} volume`}
      />
    </div>
  );
}
