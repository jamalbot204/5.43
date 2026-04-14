
import React, { memo } from 'react';
import { Attachment } from '../../../types.ts';
import { DocumentIcon, PlayCircleIcon, ArrowDownTrayIcon, XCircleIcon } from '../../common/Icons.tsx';
import RefreshAttachmentButton from '../../common/RefreshAttachmentButton.tsx';
import { useInteractionStore } from '../../../store/useInteractionStore.ts';
import { useGeminiApiStore } from '../../../store/useGeminiApiStore.ts';
import { Button } from '../../ui/Button.tsx';

interface MessageAttachmentsProps {
  messageId: string;
  attachments: Attachment[];
  isSelectionModeActive: boolean;
}

const MessageAttachments: React.FC<MessageAttachmentsProps> = memo(({ messageId, attachments, isSelectionModeActive }) => {
    const { reUploadAttachment } = useInteractionStore();
    const isLoading = useGeminiApiStore(s => s.isLoading);

    const handleDownloadAttachmentLocal = (attachment: Attachment) => {
        let downloadUrl = attachment.dataUrl;
        
        // Fallback to base64Data if dataUrl is not present (e.g., for tool-generated files)
        if (!downloadUrl && attachment.base64Data) {
            downloadUrl = `data:${attachment.mimeType};base64,${attachment.base64Data}`;
        }

        if (!downloadUrl) { 
            alert("Attachment data is not available for download."); 
            return; 
        }
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = attachment.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!attachments || attachments.length === 0) return null;

    return (
        <div className={`mt-2 gap-2 ${attachments.length > 2 ? 'flex overflow-x-auto pb-2 custom-scrollbar' : `grid ${attachments.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}`}>
            {attachments.map(attachment => (
                <div key={attachment.id} className={`relative group/attachment border border-border-base rounded-xl overflow-hidden bg-bg-element flex flex-col justify-center items-center min-h-[100px] ${attachments.length > 2 ? 'min-w-[160px] max-w-[200px] flex-shrink-0' : ''}`}>
                    {attachment.mimeType.startsWith('image/') && attachment.type === 'image' && attachment.mimeType !== 'application/pdf' ? (
                        <div className="w-full h-full flex items-center justify-center bg-bg-overlay/10 aspect-video">
                            <img src={attachment.dataUrl} alt={attachment.name} className="max-w-full max-h-60 object-contain rounded-xl cursor-pointer" onClick={() => attachment.dataUrl && window.open(attachment.dataUrl, '_blank')}/>
                        </div>
                    ) : attachment.mimeType.startsWith('video/') && attachment.type === 'video' ? (
                        <div className="w-full h-full aspect-video">
                            <video src={attachment.dataUrl} controls className="w-full h-full object-contain rounded-xl"/>
                        </div>
                    ) : (
                        <div className="p-2 w-full h-full flex flex-col items-center justify-center bg-transparent transition-colors hover:bg-bg-hover cursor-pointer aspect-video" onClick={() => attachment.dataUrl && window.open(attachment.dataUrl, '_blank')}>
                            <DocumentIcon className="w-8 h-8 mb-1 text-text-tertiary" />
                            <span className="text-xs text-text-secondary text-center break-all px-1">{attachment.name}</span>
                        </div>
                    )}
                    <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover/attachment:opacity-100 transition-opacity">
                        <Button 
                            onClick={(e) => { e.stopPropagation(); handleDownloadAttachmentLocal(attachment); }} 
                            title={`Download ${attachment.name}`} 
                            variant="ghost"
                            size="none"
                            className="p-1 bg-bg-overlay/60 text-text-primary rounded-full transition hover:bg-bg-overlay/80 h-auto w-auto" 
                            aria-label={`Download ${attachment.name}`} 
                            disabled={(!attachment.dataUrl && !attachment.base64Data) || isSelectionModeActive}
                            icon={<ArrowDownTrayIcon className="w-3 h-3" />}
                        />
                        {attachment.fileUri && (
                            <RefreshAttachmentButton attachment={attachment} onReUpload={() => reUploadAttachment(messageId, attachment.id)} disabled={attachment.isReUploading || isLoading} />
                        )}
                    </div>
                    {attachment.reUploadError && (<p className="text-xs text-tint-red-text p-1 bg-tint-red-bg/80 absolute bottom-0 w-full text-center" title={attachment.reUploadError}>Refresh Error</p>)}
                </div>
            ))}
        </div>
    );
});

export default MessageAttachments;
