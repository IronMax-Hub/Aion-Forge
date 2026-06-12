import { useState, useEffect } from "react";
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

function sliderColor(val: number): string {
  if (val < 0.5)  return "#ef4444";
  if (val < 0.8)  return "#f97316";
  if (val <= 1.2) return "#22d3ee";
  if (val <= 1.6) return "#a855f7";
  return "#ec4899";
}

function fmtVal(v: number): string { return v.toFixed(2) + "×"; }

export function RealityConfigPanel({ config, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<UniverseConfig>(config);
  useEffect(() => { setDraft(config); }, [config]);

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
