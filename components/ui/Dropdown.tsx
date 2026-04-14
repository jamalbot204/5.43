import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownProps {
  trigger: React.ReactElement;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top?: number | string, left?: number | string, bottom?: number | string, right?: number | string, transformOrigin: string }>({ transformOrigin: 'top' });
  
  const triggerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (isOpen && triggerRef.current && menuRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      
      const newCoords: typeof coords = { transformOrigin: 'top' };
      
      // Vertical Logic (Flip)
      if (triggerRect.bottom + menuRect.height > window.innerHeight - 20) {
        newCoords.bottom = window.innerHeight - triggerRect.top + 6;
        newCoords.transformOrigin = 'bottom';
      } else {
        newCoords.top = triggerRect.bottom + 6;
        newCoords.transformOrigin = 'top';
      }
      
      // Horizontal Logic (RTL/LTR Aware)
      const isRTL = document.documentElement.dir === 'rtl';
      if (isRTL) {
        let right = window.innerWidth - triggerRect.right;
        // Boundary Check: If the menu's left edge would go off-screen (less than 10px)
        if (window.innerWidth - right - menuRect.width < 10) {
          newCoords.left = 10;
          newCoords.right = 'auto';
        } else {
          newCoords.right = right;
          newCoords.left = 'auto';
        }
      } else {
        let left = triggerRect.left;
        // Boundary Check: If the menu's right edge would go off-screen (greater than window.innerWidth - 10)
        if (left + menuRect.width > window.innerWidth - 10) {
          newCoords.right = 10;
          newCoords.left = 'auto';
        } else {
          newCoords.left = left;
          newCoords.right = 'auto';
        }
      }
      
      setCoords(newCoords);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = (event: Event) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return; // Do not close if scrolling inside the dropdown
      }
      setIsOpen(false);
    };

    const handleResize = () => setIsOpen(false);

    if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, { capture: true });
        window.addEventListener('resize', handleResize);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, { capture: true });
        window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  return (
    <>
      {React.cloneElement(trigger as any, { 
        ref: triggerRef, 
        onClick: (e: React.MouseEvent) => {
          if ((trigger as any).props.onClick) (trigger as any).props.onClick(e);
          setIsOpen(!isOpen);
        } 
      })}
      {isOpen && createPortal(
        <div 
          ref={menuRef} 
          className={`fixed z-[9999] bg-bg-panel rounded-xl shadow-panel p-1 flex flex-col gap-0.5 border border-border-base animate-fade-in ${className}`} 
          style={{ 
            ...coords, 
            visibility: isVisible ? 'visible' : 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {typeof children === 'function' ? children({ close: () => setIsOpen(false) }) : children}
        </div>,
        document.body
      )}
    </>
  );
};
Dropdown.displayName = 'Dropdown';
