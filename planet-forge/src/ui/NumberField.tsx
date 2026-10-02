import { useState } from "react";

interface Props {
  label: string;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

/** A number input that keeps what you type until it is a number, so half-typed values ("-", "0.") are not lost. */
export function NumberField({ label, unit, value, onChange, min, max, step, disabled }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          inputMode="decimal"
          value={draft ?? String(value)}
          min={min}
          max={max}
          step={step ?? "any"}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </span>
    </label>
  );
}
