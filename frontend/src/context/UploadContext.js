import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { corpusAPI } from '../services/api';

const UploadContext = createContext();

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within UploadProvider');
  }
  return context;
};

const STORAGE_KEY = 'upload_context_state';

export const UploadProvider = ({ children }) => {
  // Initialize from localStorage
  const [uploads, setUploads] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[UploadContext] Restored from localStorage:', parsed);
        return parsed;
      }
    } catch (error) {
      console.error('[UploadContext] Error loading from localStorage:', error);
    }
    return [];
  });

  // Save to localStorage whenever uploads change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
      console.log('[UploadContext] Saved to localStorage:', uploads);
    } catch (error) {
      console.error('[UploadContext] Error saving to localStorage:', error);
    }
  }, [uploads]);

  // Log mount/unmount
  useEffect(() => {
    console.log('[UploadContext] UploadProvider MOUNTED');
    return () => {
      console.log('[UploadContext] UploadProvider UNMOUNTED');
    };
  }, []);

  // Add a new upload
  const addUpload = useCallback((operation_name, display_name, corpus_name, gcs_path = null) => {
    const uploadId = Date.now().toString();
    const newUpload = {
      id: uploadId,
      operation_name,
      display_name,
      corpus_name,
      gcs_path,
      status: 'processing',
      error: null,
      startTime: Date.now()
    };
    console.log('[UploadContext] Adding new upload:', newUpload);
    setUploads(prev => {
      const updated = [...prev, newUpload];
      console.log('[UploadContext] Updated uploads:', updated);
      return updated;
    });
    return uploadId;
  }, []);

  // Remove a completed upload
  const removeUpload = useCallback((uploadId) => {
    console.log('[UploadContext] Removing upload:', uploadId);
    setUploads(prev => prev.filter(u => u.id !== uploadId));
  }, []);

  // Clear all uploads
  const clearAll = useCallback(() => {
    console.log('[UploadContext] Clearing all uploads');
    setUploads([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Poll upload status
  const checkUploadStatus = useCallback(async (upload) => {
    try {
      const parts = upload.operation_name.split('/');
      const operationId = parts[parts.length - 1];
      const corpusName = parts.slice(0, 2).join('/'); // fileSearchStores/{id}

      const response = await corpusAPI.checkOperationStatus(corpusName, operationId, upload.display_name, upload.gcs_path);

      if (response.data.done) {
        if (response.data.error) {
          setUploads(prev => prev.map(u =>
            u.id === upload.id
              ? { ...u, status: 'error', error: response.data.error }
              : u
          ));
        } else {
          setUploads(prev => prev.map(u =>
            u.id === upload.id
              ? { ...u, status: 'completed' }
              : u
          ));
        }
      }
    } catch (error) {
      setUploads(prev => prev.map(u =>
        u.id === upload.id
          ? { ...u, status: 'error', error: error.message }
          : u
      ));
    }
  }, []);

  // Polling effect
  useEffect(() => {
    const processingUploads = uploads.filter(u => u.status === 'processing');

    if (processingUploads.length > 0) {
      const interval = setInterval(() => {
        processingUploads.forEach(upload => {
          checkUploadStatus(upload);
        });
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [uploads, checkUploadStatus]);

  // Get stats
  const stats = {
    total: uploads.length,
    processing: uploads.filter(u => u.status === 'processing').length,
    completed: uploads.filter(u => u.status === 'completed').length,
    error: uploads.filter(u => u.status === 'error').length
  };

  const value = {
    uploads,
    stats,
    addUpload,
    removeUpload,
    clearAll
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
};
