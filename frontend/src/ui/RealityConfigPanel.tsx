import { useState } from "react";
import type { UniverseConfig, ConfigWarning } from "../simulation/config";
import { CONFIG_LABELS, CONFIG_DESCRIPTIONS, PRESETS, validateConfig } from "../simulation/config";
import { lab } from "../audio";

interface Props {
  config: UniverseConfig;
  onChange: (next: UniverseConfig) => void;
  onClose: () => void;
}

type ConfigKey = keyof Omit<UniverseConfig, "seed">;

const SLIDER_KEYS: ConfigKey[] = [
  "gravityStrength",
  "expansionRate",
  "stellarIgnitionThreshold",
  "entropyRate",
  "emergenceSensitivity",
  "intelligenceModifier",
];

/** Neutral at the default value; accent once a law has been changed. */
function sliderColor(val: number): string {
  return Math.abs(val - 1) < 0.005 ? "var(--col-text-1)" : "var(--col-accent)";
}

function fmtVal(v: number): string { return v.toFixed(2) + "×"; }

export function RealityConfigPanel({ config, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<UniverseConfig>(config);
  const [syncedConfig, setSyncedConfig] = useState<UniverseConfig>(config);
  if (config !== syncedConfig) {
    setSyncedConfig(config);
    setDraft(config);
  }

  const warnings: ConfigWarning[] = validateConfig(draft);

  function setDraftKey(key: ConfigKey, value: number) {
    setDraft((prev) => ({ ...prev, [key]: Math.max(0.01, Math.min(2, value)) }));
  }

  function commitDraft() {
    if (JSON.stringify(draft) !== JSON.stringify(config)) {
      onChange(draft);
    }
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    const next = { ...preset.values, seed: config.seed };
    setDraft(next);
    onChange(next);
    lab.presetApply();
  }

  return (
    <div className="config-panel" role="dialog" aria-label="Laws of reality — universe configuration">
      <div className="timeline-header">
        <div className="tl-panel-label">Laws of Reality</div>
        <button className="inspector-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="config-presets">
        <div className="section-title" style={{ width: "100%", marginBottom: 4 }}>Presets</div>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="tl-filter-btn config-preset-btn"
            title={p.description}
            onClick={() => applyPreset(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="config-sliders">
        {SLIDER_KEYS.map((key) => {
          const val = draft[key] as number;
          const warn = warnings.find((w) => w.field === key);
          return (
            <div key={key} className="config-row">
              <div className="config-row-header">
                <span className="data-label">{CONFIG_LABELS[key]}</span>
                <span className="config-val" style={{ color: sliderColor(val) }}>{fmtVal(val)}</span>
              </div>
              <input
                type="range"
                min={0.01}
                max={2}
                step={0.01}
                value={val}
                className="config-slider"
                style={{ accentColor: sliderColor(val) }}
                onChange={(e) => { setDraftKey(key, parseFloat(e.target.value)); lab.sliderMove((parseFloat(e.target.value) - 0.01) / 1.99); }}
                onPointerUp={commitDraft}
              />
              <div className="config-desc">{CONFIG_DESCRIPTIONS[key]}</div>
              {warn && <div className="config-warn">⚠ {warn.message}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
