
import React, { memo, useCallback } from 'react';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { SparklesIcon, StopCircleIcon } from './Icons.tsx';
import { Button } from '../ui/Button.tsx';

interface Preset {
    label: string;
    value: number;
    icon: React.ElementType;
    colorClass: string;
}

interface ThinkingBudgetControlProps {
  value: number | undefined;
  onChange: (newValue: number | undefined) => void;
  min: number;
  max: number;
  presets: Preset[];
  modelActuallyUsesApi: boolean;
}

const ThinkingBudgetControl: React.FC<ThinkingBudgetControlProps> = memo(({
  value,
  onChange,
  min,
  max,
  presets,
  modelActuallyUsesApi,
}) => {
  const { t } = useTranslation();
  
  // If undefined, we can assume it's roughly "Dynamic" or "Max" based on API default, 
  // but for UI control we typically map it to the slider range or a preset.
  // Here we treat undefined as -1 (Dynamic) for display if that preset exists, otherwise default.
  const currentValue = value ?? -1; 

  const isPresetValue = presets.some(p => p.value === currentValue);
  
  // For the slider, if the current value is a preset (like -1 or 0), 
  // we default the slider visual position to 'min' so it looks clean.
  const sliderValue = isPresetValue ? min : currentValue;

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseInt(event.target.value, 10);
    onChange(newVal);
  }, [onChange]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (rawValue === '') {
      return; // Wait for valid input
    }
    const numValue = parseInt(rawValue, 10);
    
    // Allow users to type, but validate on blur or effectively clamp if needed.
    // Here we just check limits.
    if (!isNaN(numValue)) {
        if (numValue >= min && numValue <= max) {
            onChange(numValue);
        } else if (numValue === -1 || numValue === 0) {
             // Allow manually typing special values if they match presets
             if (presets.some(p => p.value === numValue)) {
                 onChange(numValue);
             }
        }
    }
  }, [onChange, min, max, presets]);

  const handlePresetClick = useCallback((presetValue: number) => {
      onChange(presetValue);
  }, [onChange]);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-text-primary">
            {t.thinkingBudgetLabel}
        </label>
        <div className="flex items-center space-x-2">
            {/* Presets Chips */}
            {presets.map(preset => {
                const isActive = currentValue === preset.value;
                const Icon = preset.icon;
                return (
                    <Button
                        key={preset.value}
                        onClick={() => handlePresetClick(preset.value)}
                        variant="outline"
                        size="sm"
                        className={`
                            flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition h-auto
                            ${isActive 
                                ? `${preset.colorClass} border-transparent shadow-sm` 
                                : 'bg-bg-element border-border-base text-text-tertiary hover:bg-bg-hover hover:text-text-primary'
                            }
                        `}
                    >
                        <Icon className="w-3 h-3 mr-1" />
                        {preset.label}
                    </Button>
                );
            })}
        </div>
      </div>

      <div className={`flex items-center space-x-3 bg-bg-element p-2 rounded-lg border border-border-base transition duration-200 ${isPresetValue ? 'opacity-60 grayscale' : 'opacity-100'}`}>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={sliderValue}
          onChange={handleSliderChange}
          className={`w-full h-2 bg-bg-overlay/20 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0 accent-tint-fuchsia-text`}
        />
        <input
          type="number"
          min={min}
          max={max}
          value={currentValue === -1 || currentValue === 0 ? '' : currentValue} // Don't show -1/0 in number box, clearer empty or text
          onChange={handleInputChange}
          placeholder={isPresetValue ? (currentValue === -1 ? "Dynamic" : "Off") : "Custom"}
          className={`w-20 p-1.5 bg-bg-overlay/30 border border-border-base rounded text-xs text-center focus:ring-tint-fuchsia-border focus:border-tint-fuchsia-border/20 ${isPresetValue ? 'text-text-tertiary italic' : 'text-tint-fuchsia-text font-mono'}`}
        />
      </div>
      
      <div className="flex justify-between text-[10px] text-text-tertiary mt-1 px-1 font-mono">
        <span>{min}</span>
        <span>{Math.round((max + min) / 2)}</span>
        <span>{max}</span>
      </div>

      {modelActuallyUsesApi && (
          <p className="text-[10px] text-tint-emerald-text/70 mt-1.5 flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-tint-emerald-text mr-1.5"></span>
              {t.thinkingBudgetNote}
          </p>
      )}
    </div>
  );
});

export default ThinkingBudgetControl;
