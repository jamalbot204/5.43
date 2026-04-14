import React, { useEffect, useState, ReactNode, memo } from 'react';
import { CloseIcon } from './Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { Button } from '../ui/Button.tsx';

interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    headerIcon?: ReactNode; // Optional icon to display before the title
    children: ReactNode;
    footer?: ReactNode; // Optional footer actions
    maxWidth?: string; // Tailwind max-width class (default: sm:max-w-xl)
    disableBackdropClick?: boolean;
}

const BaseModal: React.FC<BaseModalProps> = memo(({
    isOpen,
    onClose,
    title,
    headerIcon,
    children,
    footer,
    maxWidth = "sm:max-w-xl",
    disableBackdropClick = false
}) => {
    const { t } = useTranslation();
    const [isTransitioning, setIsTransitioning] = useState(true);

    // Prevent button mashing on open
    useEffect(() => {
        if (isOpen) {
            setIsTransitioning(true);
            const timer = setTimeout(() => setIsTransitioning(false), 200); // Match index.html animation duration (0.2s)
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4 transition-opacity backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={disableBackdropClick ? undefined : onClose}
        >
            <div 
                className={`bg-bg-panel/90 backdrop-blur-xl p-6 rounded-2xl shadow-panel w-full ${maxWidth} max-h-[90vh] flex flex-col text-text-primary relative overflow-hidden border border-border-base animate-modal-open`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold text-text-primary flex items-center">
                        {headerIcon && <span className="mr-3 flex items-center">{headerIcon}</span>}
                        {title}
                    </h2>
                    <Button
                        onClick={onClose}
                        disabled={isTransitioning}
                        variant="ghost"
                        size="none"
                        className="text-text-secondary p-1.5 rounded-full hover:text-text-primary bg-bg-element hover:bg-bg-hover transition-colors disabled:opacity-50 h-auto w-auto"
                        aria-label={t.close}
                        icon={<CloseIcon className="w-6 h-6" />}
                    />
                </div>

                {/* Content */}
                <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar pr-1 mb-1">
                    <fieldset disabled={isTransitioning} className="contents">
                        {children}
                    </fieldset>
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex justify-end items-center pt-4 border-t border-border-base mt-2 flex-shrink-0 gap-3">
                        <fieldset disabled={isTransitioning} className="contents">
                            {footer}
                        </fieldset>
                    </div>
                )}
            </div>
        </div>
    );
});

export default BaseModal;