import React, { memo } from 'react';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const Switch: React.FC<SwitchProps> = memo(({ className = '', checked, ...props }) => {
  return (
    <input
      type="checkbox"
      checked={checked}
      className={`h-5 w-5 text-brand-primary bg-bg-app border-border-base rounded focus:ring-ring-focus focus:ring-offset-transparent cursor-pointer disabled:opacity-50 transition-colors ${className}`}
      {...props}
    />
  );
});
Switch.displayName = 'Switch';
