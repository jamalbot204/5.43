
import React, { memo } from 'react';
import { Attachment } from '../../../types.ts';
import { DocumentIcon, XCircleIcon } from '../../common/Icons.tsx';
import { Button } from '../../ui/Button.tsx';

interface AttachmentZoneProps {
    files: Attachment[];
    onRemove: (id: string) => void;
    disabled?: boolean;
}

const AttachmentZone: React.FC<AttachmentZoneProps> = memo(({ files, onRemove, disabled }) => {
    if (files.length === 0) return null;

    return (
        <div className="px-2 py-1.5 bg-transparent overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-2 min-w-max">
                {files.map(file => {
                    const isUploading = (file.uploadState === 'reading_client' || file.uploadState === 'uploading_to_cloud' || file.uploadState === 'processing_on_server') && !file.error;
                    const isError = !!file.error || file.uploadState?.startsWith('error');

                    return (
                        <div key={file.id} className="relative group p-1.5 bg-bg-panel rounded-lg border border-border-base flex items-center gap-2 max-w-[140px]">
                            <div className="flex-shrink-0 w-6 h-6 bg-bg-element rounded flex items-center justify-center">
                                {isUploading ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-primary"></div>
                                ) : isError ? (
                                    <DocumentIcon className="w-3 h-3 text-tint-red-text" />
                                ) : file.dataUrl && file.mimeType.startsWith('image/') && file.type === 'image' ? (
                                    <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover rounded" referrerPolicy="no-referrer" />
                                ) : (
                                    <DocumentIcon className="w-3 h-3 text-text-secondary" />
                                )}
                            </div>
                            <div className="flex-grow min-w-0">
                                <p className="text-[10px] font-medium text-text-primary truncate" title={file.name}>{file.name}</p>
                            </div>
                            <Button
                                onClick={() => onRemove(file.id)} 
                                disabled={disabled}
                                variant="ghost"
                                size="none"
                                className="flex-shrink-0 text-text-muted hover:text-tint-red-text p-0.5 disabled:opacity-50" 
                                title="Remove"
                            >
                                <XCircleIcon className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default AttachmentZone;
