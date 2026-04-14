import React, { useRef, useEffect, memo, useCallback } from 'react';
import { useSettingsUI } from '../../store/ui/useSettingsUI.ts';
import { useConfirmationUI } from '../../store/ui/useConfirmationUI.ts';
import { useGlobalUiStore } from '../../store/useGlobalUiStore.ts';
import { useChatListStore } from '../../store/useChatListStore.ts';
import { useChatTitleStore } from '../../store/useChatTitleStore.ts';
import { useActiveChatStore } from '../../store/useActiveChatStore.ts';
import { useCharacterStore } from '../../store/useCharacterStore.ts';
import { useDataStore } from '../../store/useDataStore.ts';
import { useImportStore } from '../../store/useImportStore.ts';
import { APP_TITLE, APP_VERSION } from '../../constants.ts';
import { PlusIcon, TrashIcon, CogIcon, ExportIcon, ImportIcon, UsersIcon, IconDirectionLtr, IconDirectionRtl, PencilIcon, CheckIcon, XCircleIcon, DocumentDuplicateIcon, SunIcon, MoonIcon, ComputerDesktopIcon, LanguageIcon, ClipboardDocumentCheckIcon, SparklesIcon, ArrowPathIcon, TelegramIcon, DocumentIcon } from '../common/Icons.tsx';
import { useTranslation } from '../../hooks/useTranslation.ts';
import { useHistorySelectionStore } from '../../store/useHistorySelectionStore.ts';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';

const SidebarChatItem = React.memo(({ session, isActive, isEditing, isSelected, isHistorySelectionModeActive, isCharMode, selectChat, toggleChatSelection, startEditingTitle, duplicateChat, requestDeleteChatConfirmation, saveChatTitle, cancelEditingTitle, setEditingTitleValue, handleInputKeyDown, editInputRef, t }: any) => {
    let borderClass = 'border-transparent';
    let bgClass = 'hover:bg-bg-hover hover:border-border-base';
    let textClass = 'text-text-secondary';
    
    if (isActive) {
        if (isCharMode) {
            borderClass = 'border-l-tint-fuchsia-border';
            bgClass = 'bg-bg-element';
            textClass = 'text-text-primary';
        } else {
            borderClass = 'border-l-brand-primary';
            bgClass = 'bg-bg-element';
            textClass = 'text-text-primary';
        }
    } else if (isSelected) {
        bgClass = 'bg-tint-emerald-bg/10 backdrop-blur-sm';
        borderClass = 'border-l-tint-emerald-border';
    }

    return (
    <div
        onClick={() => {
            if (isEditing) return;
            selectChat(session.id);
        }}
        className={`relative flex items-center justify-between p-3 mb-2 rounded-r-xl rounded-l-sm border-l-4 group transition duration-300 ease-out cursor-pointer ${borderClass} ${bgClass}`}
    >
        <div className="flex items-center overflow-hidden flex-grow">
            {isHistorySelectionModeActive && (
                <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => toggleChatSelection(session.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mr-3 rtl:ml-3 h-4 w-4 text-brand-primary bg-bg-element border-border-base rounded focus:ring-ring-focus focus:ring-offset-bg-panel cursor-pointer flex-shrink-0"
                />
            )}
            {isCharMode && <UsersIcon className={`w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 flex-shrink-0 ${isActive ? 'text-tint-fuchsia-text' : 'text-tint-fuchsia-text/80'}`}/>}
            {isEditing ? (
                <Input
                    ref={editInputRef}
                    type="text"
                    value={session.editingValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    onBlur={() => setTimeout(cancelEditingTitle, 100)}
                    className="h-8 px-2 py-1 text-sm bg-bg-element text-text-primary rounded-md w-full focus-visible:ring-1 focus-visible:ring-ring-focus border border-border-base"
                    aria-label="Edit chat title"
                />
            ) : (
                <span className={`truncate text-sm font-medium ${textClass}`} title={session.title}>{session.title}</span>
            )}
        </div>
        {!isHistorySelectionModeActive && (
            <div className="flex items-center space-x-1 ml-2 rtl:mr-2 rtl:ml-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {isEditing ? (
                <>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); saveChatTitle(); }} className="p-1.5 text-tint-emerald-text hover:bg-tint-emerald-bg/20 rounded-md transition-colors" title={t.save}><CheckIcon className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); cancelEditingTitle(); }} className="p-1.5 text-text-muted hover:bg-bg-hover rounded-md transition-colors" title={t.cancel}><XCircleIcon className="w-3.5 h-3.5" /></Button>
                </>
            ) : (
                <>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); startEditingTitle(session.id, session.title); }} className="p-1.5 text-text-muted hover:text-brand-primary hover:bg-bg-hover rounded-md transition-colors" title={t.edit}><PencilIcon className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); duplicateChat(session.id); }} className="p-1.5 text-text-muted hover:text-tint-emerald-text hover:bg-tint-emerald-bg/10 rounded-md transition-colors" title="Duplicate"><DocumentDuplicateIcon className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" onClick={(e) => { e.stopPropagation(); requestDeleteChatConfirmation({ sessionId: session.id, sessionTitle: session.title }); }} className="p-1.5 text-text-muted hover:text-tint-red-text hover:bg-tint-red-bg/10 rounded-md transition-colors" title={t.delete}><TrashIcon className="w-3.5 h-3.5" /></Button>
                </>
            )}
            </div>
        )}
    </div>
    );
});

const Sidebar: React.FC = memo(() => {
  const { editingTitleInfo, startEditingTitle, setEditingTitleValue, cancelEditingTitle, saveChatTitle } = useChatTitleStore();
  const { currentChatId, selectChat, isCharacterModeActive, showAdvancedDataTools } = useActiveChatStore(useShallow(state => ({
      currentChatId: state.currentChatId,
      selectChat: state.selectChat,
      isCharacterModeActive: state.currentChatSession?.isCharacterModeActive ?? false,
      showAdvancedDataTools: state.currentChatSession?.settings?.showAdvancedDataTools ?? false
  })));
  const { 
    chatHistory, 
    createNewChat, 
    deleteChat, 
    duplicateChat,
    isLoadingData,
    hasMoreChats,
    isFetchingMore,
    loadMoreChats
  } = useChatListStore();
  const { handleEmbedSelectedChats, handleResetEmbedFlags } = useDataStore();
  const { handleImportAll } = useImportStore();
  
  const { openSettingsPanel, openExportConfigurationModal, openTelegramImportModal, openTextExportModal } = useSettingsUI();
  const { requestDeleteChatConfirmation, requestDeleteHistoryConfirmation } = useConfirmationUI();
  
  const { layoutDirection, toggleLayoutDirection, theme, toggleTheme, toggleLanguage, isSidebarOpen } = useGlobalUiStore();
  const { toggleCharacterMode } = useCharacterStore();
  const { isHistorySelectionModeActive, toggleHistorySelectionMode, selectedChatIds, toggleChatSelection, selectAllChats, deselectAllChats } = useHistorySelectionStore();
  const { t } = useTranslation();
  
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitleInfo.id && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTitleInfo.id]);
  
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) saveChatTitle();
    else if (e.key === 'Escape') cancelEditingTitle();
  }, [saveChatTitle, cancelEditingTitle]);

  const handleSelectAll = useCallback(() => {
    selectAllChats(chatHistory.map(s => s.id));
  }, [chatHistory, selectAllChats]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedChatIds.length > 0) {
      requestDeleteHistoryConfirmation(selectedChatIds.length);
    }
  }, [selectedChatIds, requestDeleteHistoryConfirmation]);

  const handleEmbedSelected = useCallback(() => {
    if (selectedChatIds.length > 0) {
      handleEmbedSelectedChats(selectedChatIds);
    }
  }, [selectedChatIds, handleEmbedSelectedChats]);

  const handleResetEmbedsSelected = useCallback(() => {
    if (selectedChatIds.length > 0) {
        handleResetEmbedFlags(selectedChatIds);
    }
  }, [selectedChatIds, handleResetEmbedFlags]);

  return (
    <div className={`w-[85vw] sm:w-72 bg-bg-panel backdrop-blur-md h-full flex flex-col border-r border-border-base`}>
      <div className="p-4 flex-shrink-0 z-10">
        <div className="p-3 rounded-xl bg-bg-element border border-border-base flex justify-between items-center">
            <h1 className="text-lg font-bold text-text-primary flex items-baseline tracking-tight">
            {APP_TITLE}
            <span className="text-[10px] font-normal text-tint-cyan-text ml-1.5 bg-tint-cyan-bg/10 px-1.5 py-0.5 rounded-full border border-tint-cyan-border/20 shadow-glow">v{APP_VERSION}</span>
            </h1>
            <div className="flex items-center space-x-1">
            <Button
                variant="ghost"
                onClick={toggleTheme}
                title={theme === 'light' ? 'Switch to Dark' : theme === 'dark' ? 'Switch to Studio' : 'Switch to Light'}
                className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg transition hover:bg-bg-hover"
            >
                {theme === 'light' ? <SunIcon className="w-4 h-4" /> : theme === 'dark' ? <MoonIcon className="w-4 h-4" /> : <ComputerDesktopIcon className="w-4 h-4" />}
            </Button>
            <Button
                variant="ghost"
                onClick={toggleLanguage}
                title={t.switchLanguage}
                className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg transition hover:bg-bg-hover"
            >
                <LanguageIcon className="w-4 h-4" />
            </Button>
            <Button
                variant="ghost"
                onClick={toggleLayoutDirection}
                title={t.switchLayout}
                className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg transition hover:bg-bg-hover"
            >
                {layoutDirection === 'rtl' ? <IconDirectionLtr className="w-4 h-4" /> : <IconDirectionRtl className="w-4 h-4" />}
            </Button>
            </div>
        </div>
      </div>

      <div className="px-4 space-y-3 flex-shrink-0">
        {isHistorySelectionModeActive ? (
           <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={handleSelectAll} className="text-xs py-2 rounded-xl">{t.selectAll}</Button>
              <Button variant="secondary" onClick={deselectAllChats} className="text-xs py-2 rounded-xl">{t.deselectAll}</Button>
              <Button variant="danger" onClick={handleDeleteSelected} disabled={selectedChatIds.length === 0} className="col-span-2 text-xs py-2 rounded-xl">{t.deleteSelected} ({selectedChatIds.length})</Button>
              
              <div className="col-span-2 flex gap-2">
                  <Button variant="primary" onClick={handleEmbedSelected} disabled={selectedChatIds.length === 0} className="flex-grow text-xs py-2 rounded-xl bg-tint-purple-bg/10 text-tint-purple-text hover:bg-tint-purple-bg/80" icon={<SparklesIcon className="w-3.5 h-3.5" />}>{t.embedSelected}</Button>
                  <Button variant="primary" onClick={handleResetEmbedsSelected} disabled={selectedChatIds.length === 0} title={t.resetEmbeddings} className="p-2 rounded-xl bg-tint-amber-bg/10 text-tint-amber-text hover:bg-tint-amber-bg/80"><ArrowPathIcon className="w-4 h-4" /></Button>
              </div>

              <Button variant="secondary" onClick={toggleHistorySelectionMode} className="col-span-2 text-xs py-2 rounded-xl">{t.cancelSelection}</Button>
           </div>
        ) : (
          <>
            <div className="flex space-x-2">
                <Button
                variant="primary"
                onClick={createNewChat}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl hover:scale-[1.02] active:scale-95 transition duration-200"
                icon={<PlusIcon className="w-5 h-5" />}
                >
                {t.newChat}
                </Button>
                <Button
                    variant={isCharacterModeActive ? "primary" : "secondary"}
                    onClick={toggleCharacterMode}
                    disabled={!currentChatId}
                    title={isCharacterModeActive ? "Disable Character Mode" : "Enable Character Mode"}
                    className={`p-2.5 rounded-xl ${isCharacterModeActive ? 'bg-tint-fuchsia-bg/10 text-tint-fuchsia-text border-tint-fuchsia-border/20 hover:bg-tint-fuchsia-bg/80' : ''}`}
                >
                    <UsersIcon className="w-5 h-5" />
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={openExportConfigurationModal} title={t.export} className="text-xs py-2 rounded-xl" icon={<ExportIcon className="w-3.5 h-3.5" />}>{t.export}</Button>
                <Button variant="secondary" onClick={handleImportAll} title={t.import} className="text-xs py-2 rounded-xl" icon={<ImportIcon className="w-3.5 h-3.5" />}>{t.import}</Button>
                {showAdvancedDataTools && (
                    <>
                        <Button variant="ghost" onClick={openTextExportModal} title={t.exportTxtBatch} className="col-span-2 text-xs py-2 rounded-xl text-tint-amber-text bg-tint-amber-bg/10 border border-tint-amber-border/20 hover:bg-tint-amber-bg/80" icon={<DocumentIcon className="w-3.5 h-3.5" />}> {t.exportTxtBatch}</Button>
                        <Button variant="ghost" onClick={openTelegramImportModal} title="Telegram Import" className="col-span-2 text-xs py-2 rounded-xl text-tint-emerald-text bg-tint-emerald-bg/10 border border-tint-emerald-border/20 hover:bg-tint-emerald-bg/80" icon={<TelegramIcon className="w-3.5 h-3.5" />}> Telegram Import</Button>
                    </>
                )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 custom-scrollbar">
        <div className="flex items-center justify-between mb-2 mt-2">
            <h2 className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-70 pl-1">{t.history}</h2>
            <Button 
                variant="ghost"
                onClick={toggleHistorySelectionMode}
                className={`p-1 rounded-md transition-colors ${isHistorySelectionModeActive ? 'text-tint-emerald-text bg-tint-emerald-bg/10' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}`}
                title={t.select}
            >
                <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
            </Button>
        </div>
        
        {isLoadingData ? (
          // Skeleton Loader
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-bg-element h-12 rounded-xl mb-2" />
          ))
        ) : (
          <>
            {chatHistory.length === 0 && (
              <p className="text-sm text-text-muted italic text-center py-4">{t.noChats}</p>
            )}
            
            {chatHistory.map(session => (
                <SidebarChatItem
                    key={session.id}
                    session={{...session, editingValue: editingTitleInfo.id === session.id ? editingTitleInfo.value : session.title}}
                    isActive={currentChatId === session.id}
                    isEditing={editingTitleInfo.id === session.id}
                    isSelected={selectedChatIds.includes(session.id)}
                    isHistorySelectionModeActive={isHistorySelectionModeActive}
                    isCharMode={session.isCharacterModeActive}
                    selectChat={selectChat}
                    toggleChatSelection={toggleChatSelection}
                    startEditingTitle={startEditingTitle}
                    duplicateChat={duplicateChat}
                    requestDeleteChatConfirmation={requestDeleteChatConfirmation}
                    saveChatTitle={saveChatTitle}
                    cancelEditingTitle={cancelEditingTitle}
                    setEditingTitleValue={setEditingTitleValue}
                    handleInputKeyDown={handleInputKeyDown}
                    editInputRef={editInputRef}
                    t={t}
                />
            ))}

            {hasMoreChats && !isHistorySelectionModeActive && (
              <Button
                variant="secondary"
                onClick={loadMoreChats}
                disabled={isFetchingMore}
                className="w-full py-2.5 mt-2 text-xs font-medium rounded-xl"
              >
                {isFetchingMore ? (
                  <>
                    <ArrowPathIcon className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="p-4 pt-2 border-t border-border-base">
        <Button
          variant="secondary"
          onClick={openSettingsPanel}
          className="w-full py-3 text-sm font-medium rounded-xl"
          icon={<CogIcon className="w-5 h-5" />}
        >
          {t.settings}
        </Button>
      </div>
    </div>
  );
});

export default Sidebar;