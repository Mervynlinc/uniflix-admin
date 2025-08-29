'use client';

import { useState, useEffect } from 'react';
import { 
  Download, 
  PlayCircle, 
  StopCircle, 
  RefreshCw,
  Film,
  AlertTriangle, 
  CheckCircle,
  Link
} from 'lucide-react';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export default function ScraperPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCategory, setCurrentCategory] = useState('');
  const [currentMovie, setCurrentMovie] = useState('');
  const [movies, setMovies] = useState([]);
  const [errors, setErrors] = useState([]);
  const [totalMovies, setTotalMovies] = useState(0);
  const [options, setOptions] = useState({
    baseUrl: 'http://103.145.232.246/Data/movies/Hollywood/',
    delay: 1000
  });
  const [connectionError, setConnectionError] = useState(false);

  // Use relative URLs when in the same domain
  // No need for API_BASE_URL with Next.js API routes
  
  // Poll for status updates when scraping is running
  useEffect(() => {
    let interval;
    
    if (isRunning) {
      interval = setInterval(getStatus, 2000);
    }
    
    return () => clearInterval(interval);
  }, [isRunning]);

  // Initial status check when component mounts
  useEffect(() => {
    getStatus();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('adminToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const startScraping = async () => {
    try {
      setConnectionError(false);
      const payload = {
        baseUrl: options.baseUrl,
        delay: parseInt(options.delay) || 1000
      };
      
      const response = await fetch(`${BACKEND_API_URL}/api/scraper/scrape`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setIsRunning(true);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start scraping');
      }
    } catch (error) {
      console.error('Failed to start scraping:', error);
      setErrors(prev => [...prev, `Failed to start: ${error.message}`]);
      if (error.message.includes('fetch')) {
        setConnectionError(true);
      }
    }
  };

  const stopScraping = async () => {
    try {
      setConnectionError(false);
      await fetch(`${BACKEND_API_URL}/api/scraper/stop`, {
        method: 'POST',
        headers: getAuthHeader()
      });
    } catch (error) {
      console.error('Failed to stop scraping:', error);
      if (error.message.includes('fetch')) {
        setConnectionError(true);
      }
    }
  };

  const downloadExcel = () => {
    const token = localStorage.getItem('adminToken');
    window.open(`${BACKEND_API_URL}/api/scraper/download?token=${token}`, '_blank');
  };

  const getStatus = async () => {
    try {
      setConnectionError(false);
      const response = await fetch(`${BACKEND_API_URL}/api/scraper/status`, {
        headers: getAuthHeader()
      });
      
      if (!response.ok) {
        throw new Error('API not responding');
      }
      
      const data = await response.json();
      
      setIsRunning(data.isRunning);
      setProgress(data.progress);
      setCurrentCategory(data.currentCategory);
      setCurrentMovie(data.currentMovie);
      setMovies(data.movies);
      setErrors(data.errors);
      setTotalMovies(data.totalMovies);
    } catch (error) {
      console.error('Failed to get status:', error);
      if (error.message.includes('fetch')) {
        setConnectionError(true);
      }
    }
  };

  const refreshStatus = () => {
    getStatus();
  };

  return (
    <div className="py-8 px-4">
      <div className="flex flex-col md:flex-row items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center">
            <Film className="mr-2" /> Movie Scraper
          </h1>
          <p className="text-gray-400">
            Extract movie data from online sources and import into Uniflix database
          </p>
        </div>
        
        <button 
          onClick={refreshStatus}
          className="mt-4 md:mt-0 bg-gray-700 text-gray-200 hover:bg-gray-600 py-2 px-4 rounded flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh Status
        </button>
      </div>

      {/* Connection error notice */}
      {connectionError && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-900/50 rounded-lg text-red-200">
          <h3 className="flex items-center text-lg font-medium">
            <AlertTriangle className="w-5 h-5 mr-2" /> Connection Error
          </h3>
          <p className="mt-2">
            Unable to connect to the scraper API. Make sure:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>The backend server is running</li>
            <li>You've set up the scraper routes in your server.js</li>
            <li>API endpoints are properly configured</li>
          </ul>
          <button 
            onClick={refreshStatus}
            className="mt-3 bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </button>
        </div>
      )}

      {/* Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-300 mb-1">
                URL to Scrape:
              </label>
              <div className="flex">
                <div className="bg-gray-700 border-r border-gray-600 rounded-l-md p-2 flex items-center">
                  <Link size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="baseUrl"
                  name="baseUrl"
                  value={options.baseUrl}
                  onChange={handleInputChange}
                  placeholder="http://example.com/movies/"
                  className="bg-gray-700 border border-gray-600 text-white rounded-r-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                The scraper will recursively scan all folders for video files
              </p>
            </div>

            <div>
              <label htmlFor="delay" className="block text-sm font-medium text-gray-300 mb-1">
                Delay between requests (ms):
              </label>
              <input
                type="number"
                id="delay"
                name="delay"
                value={options.delay}
                onChange={handleInputChange}
                min="500"
                className="bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button 
                onClick={startScraping} 
                disabled={isRunning || connectionError}
                className={`flex items-center px-4 py-2 rounded-md ${
                  isRunning || connectionError
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <PlayCircle className="w-4 h-4 mr-2" /> Start Scraping
              </button>
              
              <button 
                onClick={stopScraping} 
                disabled={!isRunning || connectionError}
                className={`flex items-center px-4 py-2 rounded-md ${
                  !isRunning || connectionError
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <StopCircle className="w-4 h-4 mr-2" /> Stop
              </button>
              
              <button 
                onClick={downloadExcel} 
                disabled={movies.length === 0 || connectionError}
                className={`flex items-center px-4 py-2 rounded-md ${
                  movies.length === 0 || connectionError
                    ? 'bg-gray-600 cursor-not-allowed text-gray-400' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                <Download className="w-4 h-4 mr-2" /> Download Excel
              </button>
            </div>
          </div>
        </div>
        
        {/* Status Card */}
        <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Status</h2>
          
          <div className={`rounded-md p-4 ${isRunning ? 'bg-blue-900/30' : 'bg-gray-700/50'}`}>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-medium">Status:</span>
                <span className={`px-2 py-0.5 rounded text-sm ${
                  isRunning 
                    ? 'bg-blue-900/50 text-blue-200' 
                    : movies.length > 0 
                      ? 'bg-green-900/50 text-green-200' 
                      : 'bg-gray-600 text-gray-300'
                }`}>
                  {isRunning ? 'Running' : (movies.length > 0 ? 'Completed' : 'Ready')}
                </span>
              </div>
              
              {isRunning && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 font-medium">Progress:</span>
                    <span className="text-gray-300">{movies.length} / {totalMovies} movies</span>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Folder: {currentCategory || 'Scanning...'}</span>
                      <span className="text-gray-400">{progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-400 mt-2">
                    <span>Current: {currentMovie || 'Preparing...'}</span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between items-center mt-2">
                <span className="text-gray-300 font-medium">Total Movies Found:</span>
                <span className="text-gray-300">{movies.length}</span>
              </div>
            </div>
          </div>
          
          {/* Error messages */}
          {errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-900/30 rounded-md">
              <h3 className="text-red-400 font-medium flex items-center mb-2">
                <AlertTriangle className="w-4 h-4 mr-2" /> Errors
              </h3>
              <ul className="text-red-300 text-sm space-y-1 ml-2">
                {errors.slice(-3).map((error, index) => (
                  <li key={index} className="list-disc list-inside">{error}</li>
                ))}
              </ul>
              {errors.length > 3 && (
                <p className="text-gray-400 text-xs mt-2">
                  Showing {errors.slice(-3).length} of {errors.length} errors...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Movies Table */}
      {movies.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" /> 
              Scraped Movies
              <span className="ml-2 px-2 py-0.5 bg-gray-700 rounded-full text-sm text-gray-300">
                {movies.length}
              </span>
            </h2>
          </div>
          
          <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Folder
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Download URL
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {movies.slice(-20).reverse().map((movie, index) => (
                  <tr key={index} className="hover:bg-gray-700/50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-white">
                      {movie.movie_title}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">
                      {movie.release_year}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">
                      {movie.category_id}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-300 max-w-xs truncate">
                      <div className="truncate max-w-xs" title={movie.download_url}>
                        {movie.download_url}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <p className="text-gray-400 text-xs mt-4">
            Showing most recent 20 movies of {movies.length} total (newest first)
          </p>
        </div>
      )}
    </div>
  );
}