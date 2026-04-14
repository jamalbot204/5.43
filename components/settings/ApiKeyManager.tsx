import React, { memo, useCallback, useRef } from 'react';
import { useApiKeyStore } from '../../store/useApiKeyStore.ts';
import { useConfirmationUI } from '../../store/ui/useConfirmationUI.ts';
import { ApiKey } from '../../types.ts';
import { PlusIcon, TrashIcon, CheckIcon, ChevronDoubleUpIcon, EyeIcon, EyeOffIcon, ArrowPathIcon, GripVerticalIcon, KeyIcon } from '../common/Icons.tsx';
import { Button } from '../ui/Button.tsx';

const ApiKeyItem: React.FC<{
  apiKey: ApiKey;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isKeyVisible: boolean;
  onUpdate: (id: string, name: string, value: string) => void;
  onDelete: (id: string) => void;
  onMoveToEdge: (id: string, edge: 'top' | 'bottom') => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
}> = memo(({ apiKey, index, isFirst, isLast, isKeyVisible, onUpdate, onDelete, onMoveToEdge, onDragStart, onDragEnter, onDragEnd }) => {

  const handleDeleteClick = useCallback(() => {
    onDelete(apiKey.id);
  }, [onDelete, apiKey.id]);

  const handleMoveToTop = useCallback(() => onMoveToEdge(apiKey.id, 'top'), [apiKey.id, onMoveToEdge]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`relative p-3 mb-3 rounded-e-xl rounded-s-md border border-border-base border-s-4 border-s-tint-yellow-border bg-bg-panel flex flex-col sm:flex-row items-center gap-3 cursor-move group transition hover:bg-bg-hover ${isFirst ? 'ring-1 ring-tint-yellow-border/30' : ''}`}
    >
      {/* Drag Handle & Active Indicator */}
      <div className="flex items-center self-start sm:self-center">
        <div className="cursor-grab active:cursor-grabbing p-1 text-text-tertiary hover:text-text-primary flex-shrink-0">
            <GripVerticalIcon className="w-5 h-5" />
        </div>
        <div className="w-6 h-6 flex items-center justify-center ms-1">
            {isFirst ? (
                <div className="bg-tint-emerald-bg/10 text-tint-emerald-text p-1 rounded-full shadow-panel" title="Active Key">
                    <CheckIcon className="w-4 h-4" />
                </div>
            ) : (
                <div className="text-text-tertiary">
                    <KeyIcon className="w-4 h-4" />
                </div>
            )}
        </div>
      </div>

      {/* Inputs */}
      <div className="flex-grow w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
            type="text"
            value={apiKey.name}
            onChange={(e) => onUpdate(apiKey.id, e.target.value, apiKey.value)}
            placeholder="Key Name"
            className="col-span-1 p-2 bg-bg-element border border-border-base rounded text-sm text-tint-yellow-text placeholder-text-tertiary focus:border-tint-yellow-border/20 focus:ring-1 focus:ring-tint-yellow-border"
            aria-label="API Key Name"
            onMouseDown={(e) => e.stopPropagation()} 
        />
        <input
            type={isKeyVisible ? 'text' : 'password'}
            value={apiKey.value}
            onChange={(e) => onUpdate(apiKey.id, apiKey.name, e.target.value)}
            placeholder="Paste API Key Value"
            className="col-span-1 sm:col-span-2 p-2 bg-bg-element border border-border-base rounded text-sm text-text-secondary font-mono placeholder-text-tertiary focus:border-tint-yellow-border/20 focus:ring-1 focus:ring-tint-yellow-border"
            aria-label="API Key Value"
            onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1 self-end sm:self-center">
        <Button 
            onClick={handleMoveToTop} 
            disabled={isFirst} 
            title="Set as Active (Move to Top)" 
            variant="ghost"
            size="none"
            className="p-2 text-text-tertiary hover:text-tint-yellow-text bg-bg-element hover:bg-bg-hover rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors h-auto w-auto"
            onMouseDown={(e) => e.stopPropagation()}
            icon={<ChevronDoubleUpIcon className="w-4 h-4" />}
        />
        <Button 
            onClick={handleDeleteClick} 
            title="Delete Key" 
            variant="ghost"
            size="none"
            className="p-2 text-text-tertiary hover:text-tint-red-text bg-bg-element hover:bg-bg-hover rounded-md transition-colors h-auto w-auto"
            onMouseDown={(e) => e.stopPropagation()}
            icon={<TrashIcon className="w-4 h-4" />}
        />
      </div>
    </div>
  );
});

const ApiKeyManager: React.FC = memo(() => {
  const { apiKeys, isKeyVisible, addApiKey, updateApiKey, toggleKeyVisibility, moveKeyToEdge, isRotationEnabled, toggleRotation, reorderApiKeys } = useApiKeyStore();
  const requestDeleteConfirmation = useConfirmationUI(state => state.requestDeleteConfirmation);
  
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDelete = useCallback((id: string) => {
    requestDeleteConfirmation({ sessionId: id, messageId: 'api-key' });
  }, [requestDeleteConfirmation]);
  
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
    if (dragItem.current !== null && dragItem.current !== position) {
        const newKeys = [...apiKeys];
        const draggedKey = newKeys[dragItem.current];
        newKeys.splice(dragItem.current, 1);
        newKeys.splice(position, 0, draggedKey);
        dragItem.current = position;
        reorderApiKeys(newKeys);
    }
  }, [apiKeys, reorderApiKeys]);

  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    dragOverItem.current = null;
  }, []);

  const handleDragOverContainer = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    const scrollParent = containerRef.current?.closest('.overflow-auto');
    if (!scrollParent) return;

    const { top, bottom } = scrollParent.getBoundingClientRect();
    const sensitivity = 50; 
    const scrollSpeed = 10;

    if (e.clientY < top + sensitivity) {
        scrollParent.scrollTop -= scrollSpeed;
    } else if (e.clientY > bottom - sensitivity) {
        scrollParent.scrollTop += scrollSpeed;
    }
  }, []);

  return (
    <div ref={containerRef} onDragOver={handleDragOverContainer} className="flex flex-col h-full">
      <div className="flex-grow space-y-1 overflow-visible">
        {apiKeys.map((key, index) => (
          <ApiKeyItem
            key={key.id}
            apiKey={key}
            index={index}
            isFirst={index === 0}
            isLast={index === apiKeys.length - 1}
            isKeyVisible={isKeyVisible}
            onUpdate={updateApiKey}
            onDelete={handleDelete}
            onMoveToEdge={moveKeyToEdge}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={handleDragEnd}
          />
        ))}
        {apiKeys.length === 0 && (
            <div className="p-8 text-center border-2 border-dashed border-border-base rounded-lg">
                <KeyIcon className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm text-text-secondary">No API keys found.</p>
                <p className="text-xs text-text-tertiary">Add a key to start chatting.</p>
            </div>
        )}
      </div>
      
      <div className="mt-4 pt-4 border-t border-border-base flex flex-wrap gap-3">
        <Button onClick={addApiKey} variant="primary" className="flex items-center px-4 py-2 text-sm font-medium rounded-md transition-shadow">
          <PlusIcon className="w-4 h-4 me-2" /> Add API Key
        </Button>
        <Button onClick={toggleKeyVisibility} title={isKeyVisible ? "Hide Keys" : "Show Keys"} variant="outline" size="none" className="p-2 text-text-secondary bg-bg-element rounded-md hover:text-text-primary border border-border-base hover:bg-bg-hover h-auto w-auto" icon={isKeyVisible ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />} />
        <Button 
          onClick={toggleRotation} 
          title={isRotationEnabled ? "Turn Off Key Rotation" : "Turn On Key Rotation"} 
          variant="outline"
          className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition border disabled:opacity-50 ms-auto ${
            isRotationEnabled 
              ? 'bg-tint-emerald-bg/10 text-tint-emerald-text border-tint-emerald-border/20 hover:bg-tint-emerald-bg/80' 
              : 'bg-bg-element text-text-tertiary border-border-base hover:text-text-primary'
          }`}
          disabled={apiKeys.length < 2}
        >
          <ArrowPathIcon className={`w-4 h-4 me-2 ${isRotationEnabled ? 'animate-spin-slow' : ''}`} />
          Rotation: {isRotationEnabled ? 'Active' : 'Off'}
        </Button>
      </div>
    </div>
  );
});

export default ApiKeyManager;