import React, { memo, useCallback, useState, useMemo, useEffect } from 'react';
import { AttachmentWithContext, ChatMessageRole } from '../../types.ts';
import { CloseIcon, DocumentIcon, PlayCircleIcon, ArrowUturnLeftIcon, UserIcon, SparklesIcon, ArrowPathIcon, TrashIcon } from '../common/Icons.tsx';
import RefreshAttachmentButton from '../common/RefreshAttachmentButton.tsx';
import { useGeminiApiStore } from '../../store/useGeminiApiStore.ts';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useProgressStore } from '../../store/useProgressStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { Button } from '../ui/Button.tsx';

interface ChatAttachmentsModalProps {
  isOpen: boolean;
  attachments: AttachmentWithContext[];
  chatTitle: string;
  onClose: () => void;
  onGoToMessage: (messageId: string) => void;
  autoHighlightRefresh?: boolean; // NEW PROP
}

const ChatAttachmentsModal: React.FC<ChatAttachmentsModalProps> = memo(({
  isOpen,
  attachments,
  chatTitle,
  onClose,
  onGoToMessage,
  autoHighlightRefresh
}) => {
  const { reUploadAttachment, deleteAttachment } = useInteractionStore();
  const { startProgress, updateProgress, finishProgress } = useProgressStore();
  const isLoading = useGeminiApiStore(s => s.isLoading);
  const currentChatSession = useActiveChatStore(s => s.currentChatSession);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(true);
  const { t, language } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setAreButtonsDisabled(true);
      const timerId = setTimeout(() => {
        setAreButtonsDisabled(false);
      }, 500);
      return () => clearTimeout(timerId);
    }
  }, [isOpen]);

  const visibleAttachments = useMemo(() => {
    return attachments.filter(item => {
      if (!currentChatSession) return false;
      const msg = currentChatSession.messages.find(m => m.id === item.messageId);
      if (!msg || !msg.attachments) return false;
      return msg.attachments.some(a => a.id === item.attachment.id);
    });
  }, [attachments, currentChatSession]);

  const hasRefreshableAttachments = useMemo(() => visibleAttachments.some(item => item.attachment.fileUri), [visibleAttachments]);

  const handleRefreshAll = useCallback(async () => {
    if (isRefreshingAll || isLoading) return;

    const itemsToRefresh = visibleAttachments.filter(item => item.attachment.fileUri && !item.attachment.isReUploading);
    if (itemsToRefresh.length === 0) return;

    setIsRefreshingAll(true);
    const taskId = `refresh-${Date.now()}`;
    const total = itemsToRefresh.length;
    
    const totalSizeBytes = itemsToRefresh.reduce((acc, item) => acc + item.attachment.size, 0);
    const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
    const sizeLabel = language === 'ar' ? `(الحجم الكلي: ${totalSizeMB} MB)` : `(Total: ${totalSizeMB} MB)`;
    
    startProgress(taskId, t.refreshAllLinks, `0 / ${total} ${sizeLabel}`);

    try {
      let completedCount = 0;
      
      const refreshPromises = itemsToRefresh.map(async (item) => {
          try {
            await reUploadAttachment(item.messageId, item.attachment.id);
          } finally {
            completedCount++;
            const percent = (completedCount / total) * 100;
            updateProgress(taskId, percent, `${completedCount} / ${total} ${sizeLabel}`);
          }
      });
      
      await Promise.allSettled(refreshPromises);
      finishProgress(taskId, t.done, true);
    } catch (e) {
      console.error(e);
      finishProgress(taskId, "Error", false);
    } finally {
      setIsRefreshingAll(false);
    }
  }, [visibleAttachments, reUploadAttachment, isRefreshingAll, isLoading, startProgress, updateProgress, finishProgress, t.refreshAllLinks, t.done, language]);

  const getFileIcon = useCallback((item: AttachmentWithContext, liveAttachment: any) => {
    const attachment = liveAttachment || item.attachment;
    if (attachment.dataUrl && attachment.mimeType.startsWith('image/')) {
      return <img src={attachment.dataUrl} alt={attachment.name} className="w-12 h-12 object-cover rounded-md border border-border-base/10" />;
    }
    if (attachment.dataUrl && attachment.mimeType.startsWith('video/')) {
      return <div className="w-12 h-12 bg-bg-overlay/30 rounded-md flex items-center justify-center border border-border-base/10"><PlayCircleIcon className="w-6 h-6 text-tint-orange-text" /></div>;
    }
    return <div className="w-12 h-12 bg-bg-overlay/30 rounded-md flex items-center justify-center border border-border-base/10"><DocumentIcon className="w-6 h-6 text-tint-orange-text" /></div>;
  }, []);
  
  const getRoleIcon = useCallback((role: ChatMessageRole) => {
    if (role === ChatMessageRole.USER) return <UserIcon className="w-3 h-3 text-brand-primary" />;
    if (role === ChatMessageRole.MODEL) return <SparklesIcon className="w-3 h-3 text-brand-primary" />;
    return null;
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-bg-overlay/80 z-50 flex justify-center items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-attachments-modal-title"
      onClick={onClose}
    >
      <div 
        className="bg-bg-panel p-0 rounded-2xl shadow-panel w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-text-primary relative overflow-hidden border border-border-base animate-modal-open"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 flex justify-between items-center bg-bg-element border-b border-border-base">
          <div className="flex items-center space-x-3 min-w-0">
            <h2 id="chat-attachments-modal-title" className="text-lg font-semibold text-text-primary truncate flex items-center">
                <DocumentIcon className="w-5 h-5 mr-2 text-tint-orange-text" />
                {t.attachmentsIn} "{chatTitle}"
            </h2>
            <Button
              variant="ghost"
              onClick={handleRefreshAll}
              disabled={areButtonsDisabled || isRefreshingAll || isLoading || !hasRefreshableAttachments}
              className={`relative p-1.5 text-brand-primary bg-brand-primary/10 rounded-full hover:bg-brand-primary/20 hover:text-brand-primary border border-brand-primary/30 ${autoHighlightRefresh && !isRefreshingAll ? 'ring-2 ring-ring-focus shadow-glow' : ''}`}
              title={t.refreshAllLinks}
              aria-label={t.refreshAllLinks}
            >
              {autoHighlightRefresh && !isRefreshingAll && (
                  <span className="absolute inset-0 rounded-full bg-brand-primary opacity-75 animate-ping pointer-events-none"></span>
              )}
              <ArrowPathIcon className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={areButtonsDisabled}
            className="p-1.5 rounded-full hover:bg-bg-hover"
            aria-label={t.close}
          >
            <CloseIcon className="w-6 h-6" />
          </Button>
        </div>

        <div className={`flex-grow min-h-0 overflow-y-auto p-5 space-y-3 custom-scrollbar ${areButtonsDisabled ? 'pointer-events-none opacity-60' : ''}`}>
          {visibleAttachments.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-border-base rounded-lg">
                <DocumentIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary italic">{t.noAttachments}</p>
            </div>
          ) : (
            visibleAttachments.map(item => {
              // LOOKUP LIVE STATE from currentChatSession
              let liveAttachment = item.attachment;
              const msg = currentChatSession!.messages.find(m => m.id === item.messageId);
              const found = msg!.attachments!.find(a => a.id === item.attachment.id);
              if (found) liveAttachment = found;

              return (
              <div key={item.attachment.id} className="relative p-3 rounded-r-xl rounded-l-md border border-border-base border-l-4 border-l-brand-primary bg-gradient-to-r from-brand-primary/5 to-transparent flex items-center justify-between gap-4 group transition hover:bg-bg-hover">
                
                {/* Left: Thumbnail & Info */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex-shrink-0 shadow-sm">{getFileIcon(item, liveAttachment)}</div>
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-text-primary truncate text-sm" title={liveAttachment.name}>{liveAttachment.name}</p>
                    <div className="text-xs text-text-secondary truncate mt-0.5" title={item.messageContentSnippet}>
                      <span className="opacity-70">{t.from}</span> <span className="italic text-text-secondary">"{item.messageContentSnippet}"</span>
                    </div>
                    <div className="text-[10px] text-text-muted flex items-center gap-2 mt-1.5 uppercase tracking-wide font-medium">
                      <span className="flex items-center gap-1 bg-bg-element px-1.5 py-0.5 rounded border border-border-base">
                        {getRoleIcon(item.messageRole)}
                        {item.messageRole}
                      </span>
                      <span>{new Date(item.messageTimestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {liveAttachment.fileUri && (
                    <RefreshAttachmentButton 
                      attachment={liveAttachment}
                      onReUpload={() => reUploadAttachment(item.messageId, liveAttachment.id)}
                      disabled={liveAttachment.isReUploading || isLoading || isRefreshingAll}
                    />
                  )}
                  <Button 
                    variant="ghost"
                    onClick={() => onGoToMessage(item.messageId)}
                    className="p-2 hover:text-brand-primary bg-bg-element hover:bg-bg-hover border border-border-base"
                    title={t.view}
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => deleteAttachment(item.messageId, liveAttachment.id)}
                    className="p-2 text-text-muted hover:text-tint-red-text bg-bg-element hover:bg-bg-hover border border-border-base"
                    title={t.delete}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )})
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-border-base bg-bg-element flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={areButtonsDisabled} className="px-6 py-2">{t.close}</Button>
        </div>
      </div>
    </div>
  );
});

export default ChatAttachmentsModal;