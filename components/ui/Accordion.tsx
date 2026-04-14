import React from 'react';

export interface AccordionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({ title, children, defaultOpen = false, className = '' }) => {
  return (
    <details className={`group border border-border-base rounded-xl overflow-hidden bg-bg-panel shadow-sm transition-all ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors list-none [&::-webkit-details-marker]:hidden focus:outline-none select-none">
        <div className="flex items-center gap-2">{title}</div>
        <svg className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="px-4 py-3 text-xs text-text-secondary bg-transparent border-t border-border-base">
        {children}
      </div>
    </details>
  );
};
Accordion.displayName = 'Accordion';
