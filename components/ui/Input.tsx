import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className = '', icon, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">{icon}</div>}
      <input
        ref={ref}
        className={`w-full bg-bg-element border border-transparent text-text-primary placeholder-text-muted rounded-3xl focus:ring-2 focus:ring-ring-focus focus:border-brand-primary outline-none transition-all text-sm disabled:opacity-50 shadow-sm ${icon ? 'pl-10' : 'p-2.5'} ${className}`}
        {...props}
      />
    </div>
  );
});
Input.displayName = 'Input';
