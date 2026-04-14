
import React, { memo, useCallback } from 'react';
import { useSelectionStore } from '../../store/useSelectionStore.ts';
import { useAudioStore } from '../../store/useAudioStore.ts';
import { useGlobalUiStore } from '../../store/useGlobalUiStore.ts';
import { TrashIcon, AudioResetIcon, XCircleIcon, ArrowDownTrayIcon, PdfIcon, ArrowRightStartOnRectangleIcon } from '../common/Icons.tsx';
import { useInteractionStore } from '../../store/useInteractionStore.ts';
import { useMessageStore } from '../../store/useMessageStore.ts';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { Button } from '../ui/Button.tsx';

const MultiSelectActionBar: React.FC = memo(() => {
  const { visibleMessages } = useMessageStore();
  const { deleteMultipleMessages, handleExportBatchPdf } = useInteractionStore();
  const { handleResetAudioCacheForMultipleMessages, handleBatchDownloadAudios } = useAudioStore();
  const { isSidebarOpen } = useGlobalUiStore();
  const { selectedMessageIds, clearSelection, toggleSelectionMode, selectAllVisible } = useSelectionStore();
  const { openMoveMessagesModal } = useSettingsUI();
  const { t } = useTranslation();

  const selectedCount = selectedMessageIds.length;
  const visibleMessageIds = visibleMessages.map(m => m.id);

  const handleDelete = useCallback(() => {
    if (selectedCount === 0) return;
    deleteMultipleMessages(selectedMessageIds);
  }, [selectedCount, deleteMultipleMessages, selectedMessageIds]);

  const handleResetAudio = useCallback(() => {
    if (selectedCount === 0) return;
    handleResetAudioCacheForMultipleMessages(selectedMessageIds);
  }, [selectedCount, handleResetAudioCacheForMultipleMessages, selectedMessageIds]);
  
  const handleDownload = useCallback(() => {
    if (selectedCount === 0) return;
    handleBatchDownloadAudios();
  }, [selectedCount, handleBatchDownloadAudios]);

  const handleExportPdf = useCallback(() => {
    if (selectedCount === 0) return;
    handleExportBatchPdf(selectedMessageIds);
  }, [selectedCount, handleExportBatchPdf, selectedMessageIds]);

  const handleMove = useCallback(() => {
    if (selectedCount === 0) return;
    openMoveMessagesModal();
  }, [selectedCount, openMoveMessagesModal]);

  const handleSelectAll = useCallback(() => {
    selectAllVisible(visibleMessageIds);
  }, [selectAllVisible, visibleMessageIds]);

  const handleDone = useCallback(() => {
    toggleSelectionMode();
  }, [toggleSelectionMode]);

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-bg-panel/95 backdrop-blur-md border-t border-border-base p-2 sm:p-3 pb-[env(safe-area-inset-bottom,0.5rem)] z-50 transition duration-300 ease-in-out flex items-center flex-nowrap ${isSidebarOpen ? 'md:left-72' : ''}`}>
        {/* Child 1: Fixed Start */}
        <div className="flex-shrink-0 flex items-center gap-2 px-2 border-e border-border-base me-2">
            <span className="text-sm font-medium text-text-primary whitespace-nowrap">{selectedCount} {t.selected}</span>
        </div>

        {/* Child 2: Scrollable Center */}
        <div className="flex-1 min-w-0 overflow-x-auto pt-2 pb-1">
            <div className="w-max flex items-center gap-2 px-1">
                <Button onClick={handleSelectAll} variant="ghost" size="sm" className="text-brand-primary hover:opacity-80 whitespace-nowrap" disabled={visibleMessageIds.length === 0}>{t.selectAllVisible}</Button>
                <Button onClick={clearSelection} variant="ghost" size="sm" className="text-brand-primary hover:opacity-80 whitespace-nowrap" disabled={selectedCount === 0}>{t.deselectAll}</Button>
                
                <Button onClick={handleMove} disabled={selectedCount === 0} variant="secondary" size="sm" className="text-tint-emerald-text bg-tint-emerald-bg/15 hover:bg-tint-emerald-bg/25 border-none whitespace-nowrap" title="Copy to Chat">
                    <ArrowRightStartOnRectangleIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span>Copy To</span>
                </Button>
                <Button onClick={handleExportPdf} disabled={selectedCount === 0} variant="secondary" size="sm" className="text-text-primary bg-bg-element hover:bg-bg-hover border-none whitespace-nowrap" title={t.exportToPdf}>
                    <PdfIcon className="w-4 h-4 mr-1 sm:mr-1.5 text-tint-red-text" />
                    <span>PDF</span>
                </Button>
                <Button onClick={handleDownload} disabled={selectedCount === 0} variant="secondary" size="sm" className="text-tint-emerald-text bg-tint-emerald-bg/15 hover:bg-tint-emerald-bg/25 border-none whitespace-nowrap" title={t.downloadAudios}>
                    <ArrowDownTrayIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span>{t.downloadAudios}</span>
                </Button>
                <Button onClick={handleResetAudio} disabled={selectedCount === 0} variant="secondary" size="sm" className="text-tint-amber-text bg-tint-amber-bg/15 hover:bg-tint-amber-bg/25 border-none whitespace-nowrap" title={t.resetAudio}>
                    <AudioResetIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span>{t.resetAudio}</span>
                </Button>
                <Button onClick={handleDelete} disabled={selectedCount === 0} variant="danger" size="sm" className="border-none whitespace-nowrap" title={t.delete}>
                    <TrashIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span>{t.delete}</span>
                </Button>
            </div>
        </div>

        {/* Child 3: Fixed End */}
        <div className="flex-shrink-0 ps-2 ms-1">
             <Button onClick={handleDone} variant="secondary" size="sm" className="text-text-primary bg-bg-hover hover:opacity-80 border-none whitespace-nowrap" title={t.done}>
                <XCircleIcon className="w-4 h-4 mr-1 sm:mr-1.5" /> {t.done}
            </Button>
        </div>
    </div>
  );
});

export default MultiSelectActionBar;
