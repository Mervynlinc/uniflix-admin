'use client';

import { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, RefreshCw, Sparkles, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export default function ImportAndEnrichMovies() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  
  // Progress tracking states
  const [uploadProgress, setUploadProgress] = useState(0);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  // WebSocket connection for real-time progress updates
  useEffect(() => {
    let socket = null;
    
    // Only connect when actively processing
    if (uploading || enriching) {
      // Connect to WebSocket server
      socket = new WebSocket('ws://localhost:4000/progress');
      
      socket.onopen = () => {
        console.log('WebSocket connected');
      };
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle different progress update types
        if (data.type === 'upload_progress' && uploading) {
          setUploadProgress(data.progress);
        } else if (data.type === 'enrich_progress' && enriching) {
          setEnrichProgress(data.progress);
          
          // Update status message for important events
          if (data.message && data.notifyUser) {
            setStatusMessage(data.message);
          }
        }
      };
      
      socket.onclose = () => {
        console.log('WebSocket disconnected');
      };
    }
    
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [uploading, enriching]);

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setUploadResult(null);
    setEnrichResult(null);
    setUploadProgress(0);
    setEnrichProgress(0);
    setStatusMessage('');
  };

  // Handle file upload with progress tracking
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setEnrichResult(null);
    setUploadProgress(0);
    setStatusMessage('Uploading file...');

    try {
      const formData = new FormData();
      formData.append('movieFile', file);
      formData.append('trackProgress', true);

      const token = localStorage.getItem('adminToken');
      
      // Use XMLHttpRequest for upload progress
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progressPercent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progressPercent);
          setStatusMessage(`Uploading file: ${progressPercent}%`);
        }
      });
      
      // Handle completion
      xhr.onload = () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          setUploadResult(result);
          setUploadProgress(100);
          setStatusMessage(`Upload complete! ${result.message}`);
        } else {
          setUploadResult({ 
            success: false, 
            message: 'Upload failed', 
            error: xhr.statusText 
          });
          setStatusMessage('Upload failed: ' + xhr.statusText);
        }
        setUploading(false);
      };
      
      // Handle errors
      xhr.onerror = () => {
        setUploadResult({ success: false, message: 'Upload failed', error: 'Network error' });
        setStatusMessage('Upload failed: Network error');
        setUploading(false);
      };
      
      // Open and send the request
      xhr.open('POST', 'http://localhost:4000/movies/import');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
      
    } catch (err) {
      setUploadResult({ success: false, message: 'Upload failed', error: err.message });
      setStatusMessage('Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  // Handle enrichment with progress tracking
  const handleEnrich = async () => {
    if (!uploadResult?.addedMovies?.length) return;
    setEnriching(true);
    setEnrichResult(null);
    setEnrichProgress(0);
    setStatusMessage('Starting enrichment process...');

    try {
      console.log('Movie IDs to enrich:', uploadResult.addedMovies.map(m => m.movie_id));
      
      const token = localStorage.getItem('adminToken');
      const response = await fetch('http://localhost:4000/movies/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          movieIds: uploadResult.addedMovies.map(m => m.movie_id),
          trackProgress: true
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Enrichment result:', result);
      
      setEnrichResult(result);
      setEnrichProgress(100);
      setStatusMessage(`Enrichment complete! Success: ${result.success}, Failed: ${result.failed || 0}`);
    } catch (err) {
      console.error('Enrichment error:', err);
      setEnrichResult({ 
        success: 0, 
        failed: uploadResult.addedMovies.length, 
        error: err.message 
      });
      setStatusMessage('Enrichment failed: ' + err.message);
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-white">Import & Enrich Movies</h1>
      
      {/* Status message banner */}
      {statusMessage && (
        <div className="bg-gray-800/70 border border-gray-700 rounded-md p-3 mb-6 flex items-start">
          <Info className="text-blue-400 mr-2 mt-0.5 flex-shrink-0" size={18} />
          <p className="text-gray-200">{statusMessage}</p>
        </div>
      )}
      
      {/* Step 1: Upload */}
      <form onSubmit={handleUpload} className="bg-gray-800 rounded-lg p-6 mb-6">
        <label className="block mb-2 text-white font-medium">Upload Excel File</label>
        <div className="flex items-center space-x-4 mb-4">
          <label className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded cursor-pointer">
            <Upload size={18} className="inline mr-2" />
            Select File
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
          </label>
          {file && <span className="text-gray-300">{file.name}</span>}
        </div>
        
        {/* Upload progress bar - using shadcn Progress */}
        {(uploading || uploadProgress > 0) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-300">
                {uploading ? 'Uploading and processing file...' : 'Upload complete'}
              </div>
              <span className="text-xs text-gray-400">{Math.round(uploadProgress)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}
        
        <button
          type="submit"
          disabled={!file || uploading}
          className={`bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded ${(!file || uploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {uploading ? 'Uploading...' : 'Upload & Import'}
        </button>
        
        {uploadResult && (
          <div className={`mt-4 p-3 rounded flex items-center space-x-2 ${uploadResult.success ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
            {uploadResult.success ? <CheckCircle className="text-green-500" /> : <AlertCircle className="text-red-500" />}
            <span className="text-white">{uploadResult.message}</span>
          </div>
        )}
      </form>

      {/* Step 2: Enrich */}
      {uploadResult?.success && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center mb-4">
            <Sparkles className="text-blue-400 mr-2" />
            <h2 className="text-xl text-white font-semibold">Enrich Imported Movies</h2>
          </div>
          
          <div className="mb-4 text-gray-300">
            <span className="font-bold">{uploadResult.addedMovies.length}</span> movies ready for enrichment.
          </div>
          
          {/* Enrichment progress bar - using shadcn Progress */}
          {(enriching || enrichProgress > 0) && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-300">
                  {enriching 
                    ? `Processing movies...` 
                    : 'Enrichment complete'
                  }
                </div>
                <span className="text-xs text-gray-400">{Math.round(enrichProgress)}%</span>
              </div>
              <Progress value={enrichProgress} className="h-2" />
            </div>
          )}
          
          <button
            onClick={handleEnrich}
            disabled={enriching}
            className={`bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded flex items-center ${enriching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {enriching ? (
              <>
                <RefreshCw size={18} className="inline mr-2 animate-spin" />
                Enriching...
              </>
            ) : (
              <>
                <Sparkles size={18} className="inline mr-2" />
                Enrich with TMDB Data
              </>
            )}
          </button>
          
          {/* Enrichment results */}
          {enrichResult && (
            <div className="mt-4">
              <div className="flex space-x-4 mb-2">
                <div className="bg-green-900/30 border border-green-800/40 text-green-300 px-3 py-1 rounded text-sm font-semibold">
                  Success: {enrichResult.success}
                </div>
                <div className="bg-red-900/30 border border-red-800/40 text-red-300 px-3 py-1 rounded text-sm font-semibold">
                  Failed: {enrichResult.failed || 0}
                </div>
                <div className="bg-yellow-900/30 border border-yellow-800/40 text-yellow-300 px-3 py-1 rounded text-sm font-semibold">
                  Partial: {enrichResult.partial || 0}
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto bg-gray-900/50 rounded p-2 mt-2">
                {enrichResult.details && Array.isArray(enrichResult.details) ? (
                  enrichResult.details.map((detail, idx) => (
                    <div key={idx} className={`p-2 mb-2 rounded ${
                      detail.status === 'success' ? 'bg-green-900/30' :
                      detail.status === 'partial' ? 'bg-yellow-900/30' : 'bg-red-900/30'
                    }`}>
                      <div className="flex justify-between">
                        <span className="font-medium text-white">{detail.movie_title || 'Unknown'}</span>
                        <span className={`text-sm ${
                          detail.status === 'success' ? 'text-green-400' :
                          detail.status === 'partial' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {detail.status}
                        </span>
                      </div>
                      {detail.reason && <div className="text-sm text-gray-300 mt-1">{detail.reason}</div>}
                      {detail.error && <div className="text-sm text-red-300 mt-1">{detail.error}</div>}
                    </div>
                  ))
                ) : (
                  <div className="p-2 text-gray-400">No detailed results available</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}