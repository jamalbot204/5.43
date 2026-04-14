import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils.ts';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'destructive' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'none';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ 
  className, variant = 'secondary', size = 'md', icon, isLoading, children, disabled, ...props 
}, ref) => {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap active:scale-95";
  
  const variants = {
    primary: "bg-brand-primary hover:opacity-90 text-text-on-brand shadow-panel",
    secondary: "bg-bg-element text-text-primary hover:bg-bg-hover border border-border-base shadow-sm",
    danger: "bg-tint-red-bg/15 text-tint-red-text hover:bg-tint-red-bg/25 border border-tint-red-border/30",
    ghost: "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover",
    outline: "bg-transparent border border-border-base text-text-primary hover:bg-bg-hover",
    destructive: "bg-tint-red-bg/10 hover:bg-tint-red-bg/80 text-tint-red-text shadow-sm",
    link: "bg-transparent text-brand-primary hover:underline p-0 h-auto"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-full",
    md: "px-4 py-2 text-sm rounded-full",
    lg: "px-5 py-2.5 text-base rounded-full",
    icon: "w-9 h-9 flex items-center justify-center rounded-full p-0",
    none: ""
  };

  return (
    <button ref={ref} disabled={disabled || isLoading} className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      ) : icon ? (
        <span className={children ? "mr-2" : ""}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
});
Button.displayName = 'Button';
