import React, { memo, useMemo, useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage } from '../../types.ts';
import { StarIcon, XCircleIcon } from './Icons.tsx';

import { useStreamingStore } from '../../store/useStreamingStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../ui/Button.tsx';

interface FavoritesDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
  onRemoveFavorite: (messageId: string) => void;
  triggerRef: React.RefObject<HTMLElement>;
}

const FavoritesDropdown: React.FC<FavoritesDropdownProps> = memo(({
  isOpen,
  onClose,
  onJumpToMessage,
  onRemoveFavorite,
  triggerRef,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const favoritedMessages = useActiveChatStore(useShallow(state => 
    (state.currentChatSession?.messages || []).filter(m => m.isFavorited)
  ));

  useLayoutEffect(() => {
    if (isOpen && triggerRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const menuWidth = 288;
        const margin = 8;

        let top = triggerRect.bottom + margin;
        let left: number | string = 'auto';

        const center = (triggerRect.left + triggerRect.right) / 2;
        
        if (center > viewportWidth / 2) {
            const potentialLeft = triggerRect.right - menuWidth;
            left = Math.max(10, potentialLeft);
        } else {
            const potentialLeft = triggerRect.left;
            left = Math.min(potentialLeft, viewportWidth - menuWidth - 10);
        }

        setStyle({
            position: 'fixed',
            top: top,
            left: left,
            zIndex: 50,
        });
    }
  }, [isOpen, triggerRef, favoritedMessages.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
          dropdownRef.current && 
          !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && 
          !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', onClose);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', onClose);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      className="w-72 bg-bg-panel rounded-lg shadow-panel p-3 flex flex-col max-h-96 border border-border-base"
      role="menu"
      aria-orientation="vertical"
    >
      <div className="flex items-center mb-2 px-1 pb-2 border-b border-border-base">
        <StarIcon filled className="w-4 h-4 mr-2 text-tint-yellow-text" />
        <h3 className="text-sm font-semibold text-text-primary">Favorite Messages</h3>
      </div>
      <div className="flex-grow overflow-y-auto pr-1 -mr-1 space-y-1 custom-scrollbar">
        {favoritedMessages.length === 0 ? (
          <p className="text-xs text-text-tertiary italic text-center py-4">No favorite messages yet.</p>
        ) : (
            favoritedMessages.map(message => {
              const isStreaming = useStreamingStore.getState().streamingMessageId === message.id;
              const content = isStreaming ? useStreamingStore.getState().streamingText : message.content;
              
              return (
                <div
                  key={message.id}
                  className="group flex items-center justify-between rounded-md transition-colors hover:bg-bg-hover p-1.5"
                  role="menuitem"
                >
                  <Button
                    onClick={() => onJumpToMessage(message.id)}
                    variant="ghost"
                    className="flex-grow text-left text-xs text-text-secondary focus:outline-none p-0 h-auto w-auto bg-transparent hover:bg-transparent"
                    title={content}
                  >
                    <div className="line-clamp-2">
                      <span className="font-bold text-brand-primary mr-1">{message.role === 'user' ? 'You:' : (message.characterName || 'AI')}:</span>
                      {content.substring(0, 120) || '[Attachment]'}
                    </div>
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFavorite(message.id);
                    }}
                    variant="ghost"
                    size="none"
                    className="p-1 text-text-tertiary hover:text-tint-red-text rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 flex-shrink-0 ml-2 h-auto w-auto"
                    title="Remove from favorites"
                    aria-label="Remove from favorites"
                    icon={<XCircleIcon className="w-4 h-4" />}
                  />
                </div>
              );
            })
        )}
      </div>
    </div>,
    document.body
  );
});

export default FavoritesDropdown;