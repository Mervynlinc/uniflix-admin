'use client';

import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Film, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';

export default function SeriesManagerPage() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);
  
  const BACKEND_API_URL = process.env.NEXT_PUBLIC_ADMIN_API;
  
  // Fetch all series
  useEffect(() => {
    const fetchSeries = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('adminToken');
        
        const response = await fetch(`${BACKEND_API_URL}/api/series`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        const data = await response.json();
        setSeries(data || []);
      } catch (err) {
        console.error('Error fetching series:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSeries();
  }, [BACKEND_API_URL]);
  
  // Handle delete confirmation
  const handleDeleteClick = (serie) => {
    setConfirmDelete(serie);
    setDeleteResult(null);
  };
  
  // Handle actual deletion
  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    
    setDeleting(true);
    setDeleteResult(null);
    
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${BACKEND_API_URL}/api/series/${confirmDelete.serie_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete series');
      }
      
      const result = await response.json();
      
      // Remove from list
      setSeries(prev => prev.filter(s => s.serie_id !== confirmDelete.serie_id));
      
      setDeleteResult({
        success: true,
        message: `Successfully deleted "${confirmDelete.serie_title}"`
      });
      
      // Close dialog after a delay
      setTimeout(() => {
        setConfirmDelete(null);
      }, 2000);
      
    } catch (err) {
      console.error('Delete error:', err);
      setDeleteResult({
        success: false,
        message: `Error: ${err.message}`
      });
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-white">Series Manager</h1>
      
      {/* Status message */}
      {deleteResult && !confirmDelete && (
        <div className={`mb-6 p-4 rounded-md flex items-center ${
          deleteResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
        }`}>
          {deleteResult.success ? <Check className="mr-2" /> : <AlertCircle className="mr-2" />}
          <span>{deleteResult.message}</span>
        </div>
      )}
      
      {/* Series list */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-white">All Series</h2>
        
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin mx-auto mb-3 text-blue-400" size={28} />
            <p className="text-gray-400">Loading series...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-800/40 text-red-300 p-4 rounded-md">
            <AlertCircle className="inline mr-2" />
            Error loading series: {error}
          </div>
        ) : series.length === 0 ? (
          <p className="text-gray-400 py-8 text-center">No series found in the database.</p>
        ) : (
          <div className="divide-y divide-gray-700">
            {series.map(serie => (
              <div key={serie.serie_id} className="py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-white font-medium">
                    {serie.serie_title}
                    {serie.release_year && <span className="text-gray-400 ml-2">({serie.release_year})</span>}
                  </h3>
                  <div className="text-sm text-gray-400 mt-1">
                    {serie.total_seasons || 0} seasons • {serie.total_episodes || 0} episodes
                    {serie.tmdb_id && ` • TMDB ID: ${serie.tmdb_id}`}
                  </div>
                </div>
                
                <Button 
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteClick(serie)}
                  className="bg-red-800 hover:bg-red-700"
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Series</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete "{confirmDelete?.serie_title}"?
              This will permanently remove all seasons, episodes, and associated data.
            </DialogDescription>
          </DialogHeader>
          
          <div className="bg-red-900/30 border border-red-800/40 rounded p-4 text-red-300">
            <AlertCircle className="inline-block mr-2" />
            This action cannot be undone.
          </div>
          
          {deleteResult && (
            <div className={`p-4 rounded-md ${
              deleteResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {deleteResult.success ? <Check className="inline mr-2" /> : <AlertCircle className="inline mr-2" />}
              {deleteResult.message}
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              className="bg-red-800 hover:bg-red-700"
              onClick={handleDeleteConfirm}
              disabled={deleting || deleteResult?.success}
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white mr-2"></div>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Series
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}