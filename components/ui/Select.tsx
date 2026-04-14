import React, { forwardRef } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className = '', children, options, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={`w-full p-2.5 bg-bg-element border border-transparent text-text-primary rounded-xl focus:ring-2 focus:ring-ring-focus focus:border-brand-primary outline-none transition-all text-sm ${className}`}
      {...props}
    >
      {options ? options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      )) : children}
    </select>
  );
});
Select.displayName = 'Select';
