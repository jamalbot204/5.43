
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Attachment } from '../types.ts';
import { uploadFileViaApi, deleteFileViaApi } from '../services/llm/media.ts';
import { useApiKeyStore } from '../store/useApiKeyStore.ts';
import { useGeminiApiStore } from '../store/useGeminiApiStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { formatGeminiError } from '../services/llm/utils.ts';
import { SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_VIDEO_MIME_TYPES } from '../constants.ts';
import { compressImageFile } from '../services/utils.ts';

export const useFileHandler = () => {
  const [files, setFiles] = useState<Attachment[]>([]);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  
  const { activeApiKey } = useApiKeyStore();
  const logApiRequest = useGeminiApiStore(s => s.logApiRequest);
  const showToast = useToastStore(s => s.showToast);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      uploadControllersRef.current.forEach(c => c.abort());
      uploadControllersRef.current.clear();
    };
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<Attachment>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const handleFileSelection = useCallback((fileList: FileList | null) => {
    if (!fileList) return;

    const processFile = async (originalFile: File) => {
      const file = await compressImageFile(originalFile);
      let fileTypeForApp: 'image' | 'video' | 'file' = 'file';
      
      if (SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
        fileTypeForApp = 'image';
      } else if (SUPPORTED_VIDEO_MIME_TYPES.includes(file.type)) {
        fileTypeForApp = 'video';
      }

      const attachmentId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newAttachment: Attachment = {
        id: attachmentId, 
        name: file.name, 
        mimeType: file.type, 
        size: file.size,
        type: fileTypeForApp, 
        uploadState: 'reading_client', 
        statusMessage: 'Reading file...', 
        isLoading: true,
      };

      setFiles(prev => [...prev, newAttachment]);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result || !result.startsWith('data:')) {
             updateFile(attachmentId, { error: "Failed to read file.", uploadState: 'error_client_read', isLoading: false });
             return;
        }
        
        const base64Data = result.split(',')[1];
        
        updateFile(attachmentId, {
            dataUrl: (fileTypeForApp === 'image' || fileTypeForApp === 'video') ? result : undefined,
            base64Data: base64Data,
            uploadState: 'completed', 
            statusMessage: 'Preview ready. Uploading...',
        });

        // Trigger Cloud Upload
        const upload = async () => {
            if (!activeApiKey?.value) {
                updateFile(attachmentId, { error: "API Key missing", uploadState: 'error_cloud_upload', isLoading: false });
                return;
            }

            const controller = new AbortController();
            uploadControllersRef.current.set(attachmentId, controller);

            try {
                updateFile(attachmentId, { uploadState: 'uploading_to_cloud', isLoading: true });
                
                const result = await uploadFileViaApi(
                    activeApiKey.value, 
                    file, 
                    logApiRequest, 
                    (state, apiName, msg, progress) => {
                        if (controller.signal.aborted) return;
                        updateFile(attachmentId, { 
                            uploadState: state, 
                            fileApiName: apiName, 
                            statusMessage: msg, 
                            progress,
                            isLoading: state === 'uploading_to_cloud' || state === 'processing_on_server'
                        });
                    },
                    controller.signal
                );

                if (controller.signal.aborted) return;

                if (result.error) {
                    updateFile(attachmentId, { error: result.error, uploadState: 'error_cloud_upload', statusMessage: result.error, isLoading: false });
                    showToast(`Upload failed: ${result.error}`, 'error');
                } else if (result.fileUri) {
                    updateFile(attachmentId, { 
                        fileUri: result.fileUri, 
                        fileApiName: result.fileApiName, 
                        uploadState: 'completed_cloud_upload', 
                        statusMessage: 'Cloud ready', 
                        isLoading: false, 
                        error: undefined,
                        mimeType: result.mimeType
                    });
                }
            } catch (err: any) {
                if (!controller.signal.aborted) {
                    const msg = formatGeminiError(err);
                    updateFile(attachmentId, { error: msg, uploadState: 'error_cloud_upload', isLoading: false });
                }
            } finally {
                uploadControllersRef.current.delete(attachmentId);
            }
        };
        upload();
      };
      reader.onerror = () => updateFile(attachmentId, { error: "Failed to read file.", uploadState: 'error_client_read', isLoading: false });
      reader.readAsDataURL(file);
    };

    for (let i = 0; i < fileList.length; i++) {
        processFile(fileList[i]);
    }
  }, [activeApiKey, logApiRequest, showToast, updateFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<any>) => {
      if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          handleFileSelection(e.clipboardData.files);
      }
  }, [handleFileSelection]);

  const removeFile = useCallback(async (id: string) => {
      const file = files.find(f => f.id === id);
      if (!file) return;

      const controller = uploadControllersRef.current.get(id);
      if (controller) {
          controller.abort();
          uploadControllersRef.current.delete(id);
      }

      setFiles(prev => prev.filter(f => f.id !== id));

      if (file.fileApiName && activeApiKey?.value) {
          try {
              await deleteFileViaApi(activeApiKey.value, file.fileApiName, logApiRequest);
          } catch (e) {
              console.warn("Failed to cleanup cloud file:", e);
          }
      }
  }, [files, activeApiKey, logApiRequest]);

  const resetFiles = useCallback(() => {
      uploadControllersRef.current.forEach(c => c.abort());
      uploadControllersRef.current.clear();
      setFiles([]);
  }, []);

  const getValidFiles = useCallback(() => {
      return files.filter(f => f.uploadState === 'completed_cloud_upload' && f.fileUri && !f.error);
  }, [files]);

  return {
      files,
      handleFileSelection,
      handlePaste,
      removeFile,
      resetFiles,
      getValidFiles,
      isAnyFileStillProcessing: files.some(f => f.isLoading)
  };
};
