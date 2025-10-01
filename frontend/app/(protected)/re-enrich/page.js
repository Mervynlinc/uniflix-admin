'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function ReEnrichPage() {
  const [moviesWithMissingData, setMoviesWithMissingData] = useState([]);
  const [seriesWithMissingData, setSeriesWithMissingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichTarget, setEnrichTarget] = useState(null);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichResult, setEnrichResult] = useState(null);

  const BACKEND_API_URL = process.env.NEXT_PUBLIC_ADMIN_API;
  
  // Fetch data on page load
  useEffect(() => {
    fetchMissingData();
  }, []);
  
  // WebSocket connection for real-time progress updates
  useEffect(() => {
    let socket = null;
    
    if (enriching) {
      socket = new WebSocket(`${BACKEND_API_URL}/progress`);
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'enrich_progress') {
          setEnrichProgress(data.progress);
          
          if (data.progress === 100) {
            setTimeout(() => {
              fetchMissingData();
              setEnriching(false);
              setEnrichTarget(null);
              setEnrichResult({
                success: data.status === 'success',
                message: data.message
              });
            }, 1000);
          }
        }
      };
    }
    
    return () => socket?.close();
  }, [enriching, BACKEND_API_URL]);
  
  // Fetch missing data from API
  const fetchMissingData = async () => {
    setLoading(true);
    
    try {
      const token = localStorage.getItem('adminToken');
      
      // Fetch movies with missing data
      const movieResponse = await fetch(`${BACKEND_API_URL}/api/movies/missing-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (movieResponse.ok) {
        setMoviesWithMissingData(await movieResponse.json());
      }
      
      // Fetch series with missing data
      const seriesResponse = await fetch(`${BACKEND_API_URL}/api/series/missing-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (seriesResponse.ok) {
        setSeriesWithMissingData(await seriesResponse.json());
      }
    } catch (error) {
      console.error('Error fetching missing data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle re-enrichment for a movie
  const handleReEnrichMovie = async (movieId) => {
    setEnriching(true);
    setEnrichTarget(`movie-${movieId}`);
    setEnrichProgress(0);
    setEnrichResult(null);
    
    try {
      const token = localStorage.getItem('adminToken');
      await fetch(`${BACKEND_API_URL}/movies/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ movieIds: [movieId], trackProgress: true }),
      });
    } catch (error) {
      console.error('Error enriching movie:', error);
      setEnriching(false);
      setEnrichTarget(null);
      setEnrichResult({
        success: false,
        message: `Failed to enrich: ${error.message}`
      });
    }
  };
  
  // Handle re-enrichment for a series
  const handleReEnrichSeries = async (serieId) => {
    setEnriching(true);
    setEnrichTarget(`series-${serieId}`);
    setEnrichProgress(0);
    setEnrichResult(null);
    
    try {
      const token = localStorage.getItem('adminToken');
      await fetch(`${BACKEND_API_URL}/api/series/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ seriesIds: [serieId], trackProgress: true }),
      });
    } catch (error) {
      console.error('Error enriching series:', error);
      setEnriching(false);
      setEnrichTarget(null);
      setEnrichResult({
        success: false,
        message: `Failed to enrich: ${error.message}`
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-white">Re-Enrich Content</h1>
      
      {enrichResult && (
        <div className={`mb-6 p-4 rounded flex items-center ${
          enrichResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
        }`}>
          {enrichResult.success ? <CheckCircle className="mr-2" /> : <AlertCircle className="mr-2" />}
          <span>{enrichResult.message}</span>
        </div>
      )}
      
      <Tabs defaultValue="movies">
        <TabsList className="mb-6">
          <TabsTrigger value="movies">Movies Missing Data</TabsTrigger>
          <TabsTrigger value="series">Series Missing Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="movies" className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Movies with Missing Information</h2>
            
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
                <p className="text-gray-400">Loading...</p>
              </div>
            ) : moviesWithMissingData.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                <p className="text-gray-400">All movies are properly enriched!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {moviesWithMissingData.map(movie => (
                  <div 
                    key={movie.movie_id} 
                    className="bg-gray-900 rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <h3 className="text-lg font-medium text-white">{movie.movie_title} {movie.release_year && `(${movie.release_year})`}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!movie.image_url && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Image</span>
                        )}
                        {!movie.plot && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Plot</span>
                        )}
                        {!movie.tmdb_id && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No TMDB ID</span>
                        )}
                        {!movie.trailer && (
                          <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-1 rounded">No Trailer</span>
                        )}
                        {!movie.rating && (
                          <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-1 rounded">No Rating</span>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      {enriching && enrichTarget === `movie-${movie.movie_id}` ? (
                        <div className="w-36">
                          <Progress value={enrichProgress} className="h-2 mb-1" />
                          <span className="text-xs text-gray-400">{enrichProgress}% Complete</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReEnrichMovie(movie.movie_id)}
                          disabled={enriching}
                          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center text-sm disabled:opacity-50"
                        >
                          <Sparkles size={16} className="mr-1" />
                          Re-Enrich
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="series" className="space-y-6">
          {/* Similar content as movies tab but for series */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Series with Missing Information</h2>
            
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
                <p className="text-gray-400">Loading...</p>
              </div>
            ) : seriesWithMissingData.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                <p className="text-gray-400">All series are properly enriched!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {seriesWithMissingData.map(series => (
                  <div 
                    key={series.serie_id} 
                    className="bg-gray-900 rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <h3 className="text-lg font-medium text-white">{series.serie_title} {series.release_year && `(${series.release_year})`}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!series.image_url && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Image</span>
                        )}
                        {!series.description && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Description</span>
                        )}
                        {!series.tmdb_id && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No TMDB ID</span>
                        )}
                        {!series.trailer && (
                          <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2 py-1 rounded">No Trailer</span>
                        )}
                        {series.missing?.includes('seasons') && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Seasons</span>
                        )}
                        {series.missing?.includes('episodes') && (
                          <span className="bg-red-900/40 text-red-400 text-xs px-2 py-1 rounded">No Episodes</span>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      {enriching && enrichTarget === `series-${series.serie_id}` ? (
                        <div className="w-36">
                          <Progress value={enrichProgress} className="h-2 mb-1" />
                          <span className="text-xs text-gray-400">{enrichProgress}% Complete</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleReEnrichSeries(series.serie_id)}
                          disabled={enriching}
                          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded flex items-center text-sm disabled:opacity-50"
                        >
                          <Sparkles size={16} className="mr-1" />
                          Re-Enrich
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}