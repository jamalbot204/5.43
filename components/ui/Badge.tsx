import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '', ...props }) => {
  const variants = {
    default: 'bg-bg-element text-text-primary',
    success: 'bg-tint-emerald-bg/10 text-tint-emerald-text border border-tint-emerald-border/20',
    warning: 'bg-tint-amber-bg/10 text-tint-amber-text border border-tint-amber-border/20',
    error: 'bg-tint-red-bg/10 text-tint-red-text border border-tint-red-border/20',
    info: 'bg-tint-cyan-bg/10 text-tint-cyan-text border border-tint-cyan-border/20',
    outline: 'border border-border-base text-text-secondary'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};
Badge.displayName = 'Badge';
