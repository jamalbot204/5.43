import React, { forwardRef } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`w-full p-3 bg-bg-element border border-transparent text-text-primary placeholder-text-muted rounded-3xl focus:ring-2 focus:ring-ring-focus focus:border-brand-primary outline-none transition-all text-sm resize-y shadow-sm ${className}`}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';
