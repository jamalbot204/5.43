
import React, { useRef, useCallback, useImperativeHandle, forwardRef, memo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useMessageStore } from '../../store/useMessageStore.ts';
import { useGeminiApiStore } from '../../store/useGeminiApiStore.ts';
import { ChatMessageRole } from '../../types.ts';
import MessageItem from './message/MessageItem.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon, FlowRightIcon } from '../common/Icons.tsx';

import { Button } from '../ui/Button.tsx';
import { useStreamingStore } from '../../store/useStreamingStore.ts';
import { useShallow } from 'zustand/react/shallow';

export interface ChatMessageListHandles {
    scrollToMessage: (messageId: string) => void;
}

interface ChatMessageListProps {
    onEnterReadMode: (messageId: string) => void;
}

const ChatMessageList = memo(forwardRef<ChatMessageListHandles, ChatMessageListProps>(({ onEnterReadMode }, ref) => {
    const { currentChatSession, isCharacterModeActive, showContinueFlowButton } = useActiveChatStore(useShallow(state => ({
        currentChatSession: state.currentChatSession,
        isCharacterModeActive: state.currentChatSession?.isCharacterModeActive,
        showContinueFlowButton: state.currentChatSession?.settings?.showContinueFlowButton
    })));
    const { visibleMessages, totalMessagesInSession, scrollBottomTrigger } = useMessageStore();
    const { isLoading, handleContinueFlow } = useGeminiApiStore();
    const { isStreaming } = useStreamingStore(useShallow(state => ({
        isStreaming: state.isStreaming
    })));
    const { t } = useTranslation();

    const messageListRef = useRef<HTMLDivElement>(null);
    const virtualizerContainerRef = useRef<HTMLDivElement>(null);
    const [expansionState, setExpansionState] = useState<Record<string, { content?: boolean; thoughts?: boolean }>>({});
    
    // Scroll Buttons State
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    // Smart Scroll Logic Refs
    const isPinnedRef = useRef(true);
    const lastMessageIdRef = useRef<string | null>(null);
    const userToggledMessageIdRef = useRef<string | null>(null);

    const ticking = useRef(false);

    const isCharacterMode = currentChatSession?.isCharacterModeActive || false;
    const characters = currentChatSession?.aiCharacters || [];
    const activeMemoryAnchorId = currentChatSession?.settings.activeMemoryAnchorId;

    const virtualizer = useVirtualizer({
        count: visibleMessages.length,
        getScrollElement: () => messageListRef.current,
        estimateSize: () => 80,
        overscan: 5,
        measureElement: (element) => (element as HTMLElement).offsetHeight,
    });

    // Prevent virtualizer from auto-scrolling when the last message grows (e.g. during streaming)
    // This fixes the issue where scrolling up during streaming pulls the user down line by line.
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) => {
        if (item.index === visibleMessages.length - 1) {
            return false;
        }
        
        // If the user just clicked "Show more" or "Thoughts" on this specific message,
        // do not adjust scroll position so it expands downwards naturally.
        const msg = visibleMessages[item.index];
        if (msg && msg.id === userToggledMessageIdRef.current) {
            return false;
        }
        
        return item.start < (instance as any).getScrollOffset() + ((instance as any).scrollAdjustments || 0);
    };

    const toggleExpansion = useCallback((messageId: string, type: 'content' | 'thoughts') => {
        userToggledMessageIdRef.current = messageId;
        setExpansionState(prev => {
            const isCurrentlyExpanded = !!prev[messageId]?.[type];
            
            if (!isCurrentlyExpanded) {
                // Expanding: close this type for all other messages
                const newState = { ...prev };
                Object.keys(newState).forEach(id => {
                    if (id !== messageId && newState[id]) {
                        newState[id] = { ...newState[id], [type]: false };
                    }
                });
                newState[messageId] = { ...newState[messageId], [type]: true };
                return newState;
            } else {
                // Collapsing: just toggle it off
                return {
                    ...prev,
                    [messageId]: { ...prev[messageId], [type]: false }
                };
            }
        });
        
        // Clear the ref after a short delay to allow the virtualizer to measure the new size
        setTimeout(() => {
            if (userToggledMessageIdRef.current === messageId) {
                userToggledMessageIdRef.current = null;
            }
        }, 200);
    }, []);

    // 1. SCROLL HANDLER: Track if user is at the bottom
    const handleScroll = useCallback(() => {
        if (!messageListRef.current || ticking.current) return;
        ticking.current = true;
        requestAnimationFrame(() => {
            if (messageListRef.current) {
                const { scrollTop, scrollHeight, clientHeight } = messageListRef.current;
                const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                
                // If user scrolls up (distance from bottom increases), break pin
                if (distanceFromBottom > 15) {
                    isPinnedRef.current = false;
                } else {
                    // If user hits the bottom, re-pin
                    isPinnedRef.current = true;
                }

                setShowScrollTop(scrollTop > 500);
                setShowScrollBottom(distanceFromBottom > 500);
            }
            ticking.current = false;
        });
    }, []);

    // 1b. PHYSICAL INTERACTION HANDLERS: Break pin synchronously to beat RAF race condition
    const breakPin = useCallback(() => {
        isPinnedRef.current = false;
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const el = messageListRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Break pin if clicking on scrollbar (right or left edge)
        if (e.clientX > rect.right - 20 || e.clientX < rect.left + 20) {
            isPinnedRef.current = false;
        }
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
            isPinnedRef.current = false;
        }
    }, []);

    const scrollToTop = useCallback(() => {
        virtualizer.scrollToIndex(0, { align: 'start', behavior: 'auto' });
    }, [virtualizer]);

    const scrollToBottom = useCallback(() => {
        isPinnedRef.current = true;
        if (visibleMessages.length > 0) {
            virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end', behavior: 'auto' });
        }
    }, [virtualizer, visibleMessages.length]);

    // 2. CHAT SWITCH: Always force scroll to bottom when opening a new chat
    useEffect(() => {
        if (currentChatSession?.id && visibleMessages.length > 0) {
            isPinnedRef.current = true;
            setTimeout(() => {
                virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end' });
            }, 0);
        }
    }, [currentChatSession?.id]);



    // 3. SMART STICKINESS: Auto-scroll on new messages at the bottom
    useEffect(() => {
        if (visibleMessages.length === 0) return;

        lastMessageIdRef.current = visibleMessages[visibleMessages.length - 1].id;

        if (isPinnedRef.current) {
            setTimeout(() => {
                virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end', behavior: 'auto' });
            }, 0);
        }
    }, [visibleMessages, isStreaming, virtualizer]);

    // 3b. RESIZE OBSERVER: Smoothly follow the content as it grows, without layout thrashing
    useEffect(() => {
        const el = messageListRef.current;
        const innerContainer = virtualizerContainerRef.current;
        if (!el || !innerContainer) return;

        const observer = new ResizeObserver(() => {
            if (isPinnedRef.current && visibleMessages.length > 0) {
                // Direct DOM manipulation is safer here to avoid React state loops with the virtualizer
                el.scrollTop = el.scrollHeight;
            }
        });

        observer.observe(innerContainer);

        return () => observer.disconnect();
    }, [isStreaming, visibleMessages.length, virtualizer]);

    // 4. EXPLICIT TRIGGER: Auto-scroll on delete/bulk actions
    useEffect(() => {
        if (isPinnedRef.current && visibleMessages.length > 0) {
            setTimeout(() => {
                virtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end' });
            }, 0);
        }
    }, [scrollBottomTrigger]);

    useImperativeHandle(ref, () => ({
        scrollToMessage: (messageId: string) => {
            const index = visibleMessages.findIndex(m => m.id === messageId);
    
            const highlightElement = (targetId: string) => {
                // Delay to allow virtualizer to render the element in the DOM
                setTimeout(() => {
                    const element = messageListRef.current?.querySelector(`#message-item-${targetId}`);
                    if (element) {
                        // Cleanup previous animation classes if present to reset
                        element.classList.remove(
                            'transition-colors', 'duration-300', 'duration-[1500ms]', 'ease-out', 
                            'bg-tint-cyan-bg/20'
                        );
                        
                        // Force reflow
                        void (element as HTMLElement).offsetWidth;

                        // Phase 1: Focus Flash (Fast entry)
                        element.classList.add(
                            'transition-colors', 
                            'duration-300', 
                            'ease-out',
                            'bg-tint-cyan-bg/20'
                        );

                        // Phase 2: Slow Fade Out (Relaxation)
                        setTimeout(() => {
                            // Switch to slow duration for the return animation
                            element.classList.remove('duration-300');
                            element.classList.add('duration-[1500ms]');
                            
                            // Remove highlight property to trigger the transition back to normal
                            element.classList.remove('bg-tint-cyan-bg/20');
                            
                            // Final cleanup after fade completes
                            setTimeout(() => {
                                element.classList.remove('transition-colors', 'duration-[1500ms]', 'ease-out');
                            }, 1500);
                        }, 400); // Hold the flash for 400ms before fading out
                    }
                }, 150); // Short delay for virtualizer rendering
            };
    
            if (index > -1) {
                virtualizer.scrollToIndex(index, { align: 'center', behavior: 'auto' });
                highlightElement(messageId);
            }
        }
    }), [visibleMessages, virtualizer]);

    return (
        <div 
            ref={messageListRef} 
            onScroll={handleScroll} 
            onWheel={breakPin}
            onTouchMove={breakPin}
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyDown}
            className={`flex-1 p-3 sm:p-4 md:p-6 pb-0 overflow-y-auto relative`} 
            style={{ overflowAnchor: 'none' }}
            role="log" 
            aria-live="polite"
        >
            
            {/* Top Scroll Button - Stick to absolute top edge */}
            <div className={`sticky top-0 w-full flex justify-end px-1 z-50 pointer-events-none transition-opacity duration-300 -mb-10 ${showScrollTop ? 'opacity-100' : 'opacity-0'}`}>
                <Button
                    onClick={scrollToTop}
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-bg-panel backdrop-blur-md text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-base shadow-panel pointer-events-auto transform translate-y-1"
                    title="Scroll to Top"
                >
                    <ChevronDoubleUpIcon className="w-4 h-4" />
                </Button>
            </div>

            {currentChatSession ? (
                visibleMessages.length > 0 ? (
                    <div ref={virtualizerContainerRef}>
                        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {virtualizer.getVirtualItems().map((virtualItem) => {
                                const msg = visibleMessages[virtualItem.index];
                                if (!msg) return null;
                                const fullMessageList = currentChatSession!.messages;
                                const currentMessageIndexInFullList = fullMessageList.findIndex(m => m.id === msg.id);
                                const nextMessageInFullList = (currentMessageIndexInFullList !== -1 && currentMessageIndexInFullList < fullMessageList.length - 1) ? fullMessageList[currentMessageIndexInFullList + 1] : null;
                                const canRegenerateFollowingAI = msg.role === ChatMessageRole.USER && nextMessageInFullList !== null && (nextMessageInFullList.role === ChatMessageRole.MODEL || nextMessageInFullList.role === ChatMessageRole.ERROR) && !isCharacterMode;
                                
                                const isLatestMemoryUpdate = msg.id === activeMemoryAnchorId;

                                return (
                                    <div className="virtual-item-container" key={virtualItem.key} ref={virtualizer.measureElement} data-index={virtualItem.index} style={{ position: 'absolute', top: `${virtualItem.start}px`, left: 0, width: '100%' }}>
                                        <MessageItem 
                                            message={msg} 
                                            canRegenerateFollowingAI={canRegenerateFollowingAI} 
                                            chatScrollContainerRef={messageListRef} 
                                            onEnterReadMode={onEnterReadMode} 
                                            isContentExpanded={!!expansionState[msg.id]?.content} 
                                            isThoughtsExpanded={!!expansionState[msg.id]?.thoughts} 
                                            onToggleExpansion={toggleExpansion} 
                                            isLatestMemoryUpdate={isLatestMemoryUpdate}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Chat Status Footer */}
                        {!isLoading && !isCharacterModeActive && showContinueFlowButton && visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === 'model' && (
                            <div className="relative z-10 mt-2 mb-2 px-4 flex flex-col items-start gap-4 animate-fade-in">
                                {/* Continue Flow Button - Only in Normal Mode */}
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleContinueFlow}
                                    className="flex items-center gap-2 py-2.5 px-6 rounded-full border-tint-emerald-border/20 text-tint-emerald-text bg-tint-emerald-bg/10 backdrop-blur-md hover:bg-tint-emerald-bg/80 transition-all shadow-panel group border-2"
                                >
                                    <FlowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    <span className="text-xs font-bold uppercase tracking-widest">{t.continueFlow}</span>
                                </Button>
                            </div>
                        )}
                    </div>
                ) : ( <div className="text-center text-text-muted italic mt-10">{isCharacterMode && characters.length === 0 ? "Add some characters and start the scene!" : (isCharacterMode ? "Select a character to speak." : t.noChats)}</div>)
            ) : ( <div className="text-center text-text-muted italic mt-10">{t.noChats}</div>)}

            {/* Bottom Scroll Button - Stick to absolute bottom edge */}
            <div className={`sticky bottom-4 w-full flex justify-end px-1 z-40 pointer-events-none transition-opacity duration-300 -mt-10 ${showScrollBottom ? 'opacity-100' : 'opacity-0'}`}>
                <Button
                    onClick={scrollToBottom}
                    variant="primary"
                    size="icon"
                    className="rounded-full shadow-panel pointer-events-auto transform -translate-y-1"
                    title="Scroll to Bottom"
                >
                    <ChevronDoubleDownIcon className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}));

export default ChatMessageList;
