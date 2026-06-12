import type { UniverseConfig, ConfigWarning } from "../simulation/config";
import { CONFIG_LABELS, CONFIG_DESCRIPTIONS, PRESETS, validateConfig } from "../simulation/config";

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

function fmtVal(v: number) {
  return v.toFixed(2);
}

function sliderColor(v: number): string {
  if (v < 0.4)  return "rgba(100, 160, 255, 0.8)";
  if (v > 1.6)  return "rgba(255, 140, 80, 0.8)";
  return "rgba(100, 210, 160, 0.8)";
}

export function RealityConfigPanel({ config, onChange, onClose }: Props) {
  const warnings: ConfigWarning[] = validateConfig(config);

  function set(key: ConfigKey, value: number) {
    onChange({ ...config, [key]: Math.max(0.01, Math.min(2, value)) });
  }

  return (
    <div className="config-panel">
      <div className="timeline-header">
        <span className="hud-title" style={{ fontSize: 10, marginBottom: 0 }}>LAWS OF REALITY</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      {/* Presets */}
      <div className="config-presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="tl-filter-btn config-preset-btn"
            title={p.description}
            onClick={() => onChange({ ...p.values, seed: config.seed })}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="config-sliders">
        {SLIDER_KEYS.map((key) => {
          const val = config[key] as number;
          const warn = warnings.find((w) => w.field === key);
          return (
            <div key={key} className="config-row">
              <div className="config-row-header">
                <span className="meta-label">{CONFIG_LABELS[key]}</span>
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
                onChange={(e) => set(key, parseFloat(e.target.value))}
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
