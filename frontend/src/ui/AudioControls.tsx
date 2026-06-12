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
        title={prefs.muted ? "Unmute audio" : "Mute audio"}
        aria-label={prefs.muted ? "Unmute" : "Mute"}
      >
        {prefs.muted ? "○" : "◎"}
      </button>

      <button
        className="audio-expand-btn"
        onClick={() => setExpanded((v) => !v)}
        aria-label="Audio settings"
        title="Audio settings"
      >
        ⊹
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
