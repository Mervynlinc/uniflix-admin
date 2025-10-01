'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  PlayCircle,
  StopCircle,
  RefreshCw,
  Film,
  Tv,
  AlertTriangle,
  CheckCircle,
  Link,
  Eye,
  EyeOff,
  Monitor
} from 'lucide-react';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_ADMIN_API;

export default function EnhancedScraperPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentCategory, setCurrentCategory] = useState('');
  const [currentItem, setCurrentItem] = useState('');
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [errors, setErrors] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [processedItems, setProcessedItems] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [scrapingType, setScrapingType] = useState('movies'); // 'movies' or 'series'
  const [showFailedItems, setShowFailedItems] = useState(false);
  
  const [movieOptions, setMovieOptions] = useState({
    baseUrl: 'http://103.145.232.246/Data/movies/Hollywood/',
    delay: 1000
  });
  
  const [seriesOptions, setSeriesOptions] = useState({
    baseUrl: 'http://103.145.232.246/Data/series/',
    delay: 1000
  });
  
  const [connectionError, setConnectionError] = useState(false);
  const [activeTab, setActiveTab] = useState('movies'); // 'movies' or 'series'

  const getAuthHeader = () => {
    const token = localStorage.getItem('adminToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const getStatus = useCallback(async () => {
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
      setCurrentItem(data.currentItem);
      setMovies(data.movies || []);
      setSeries(data.series || []);
      setErrors(data.errors || []);
      setTotalItems(data.totalItems);
      setProcessedItems(data.processedItems || 0);
      setPhase(data.phase || 'idle');
      setScrapingType(data.type || 'movies');
    } catch (error) {
      console.error('Failed to get status:', error);
      if (error.message.includes('fetch')) {
        setConnectionError(true);
      }
    }
  }, [BACKEND_API_URL]);

  // Poll for status updates when scraping is running
  useEffect(() => {
    let interval;
    if (isRunning) {
      interval = setInterval(getStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [isRunning, getStatus]);

  // Initial status check when component mounts
  useEffect(() => {
    getStatus();
  }, [getStatus]);

  const handleMovieInputChange = (e) => {
    const { name, value } = e.target;
    setMovieOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSeriesInputChange = (e) => {
    const { name, value } = e.target;
    setSeriesOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const startMovieScraping = async () => {
    try {
      setConnectionError(false);
      const payload = {
        baseUrl: movieOptions.baseUrl,
        delay: parseInt(movieOptions.delay) || 1000
      };

      const response = await fetch(`${BACKEND_API_URL}/api/scraper/scrape`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsRunning(true);
        setActiveTab('movies');
        setErrors([]);
        setMovies([]);
        setSeries([]);
        setProgress(0);
        setProcessedItems(0);
        setTotalItems(0);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start movie scraping');
      }
    } catch (error) {
      console.error('Failed to start movie scraping:', error);
      if (error.message.includes('fetch')) {
        setConnectionError(true);
      }
    }
  };

  const startSeriesScraping = async () => {
    try {
      setConnectionError(false);
      const payload = {
        baseUrl: seriesOptions.baseUrl,
        delay: parseInt(seriesOptions.delay) || 1000
      };

      const response = await fetch(`${BACKEND_API_URL}/api/scraper/scrape-series`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsRunning(true);
        setActiveTab('series');
        setErrors([]);
        setMovies([]);
        setSeries([]);
        setProgress(0);
        setProcessedItems(0);
        setTotalItems(0);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start series scraping');
      }
    } catch (error) {
      console.error('Failed to start series scraping:', error);
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

  const refreshStatus = () => {
    getStatus();
  };

  const getPhaseDisplay = () => {
    switch(phase) {
      case 'scanning': return 'Scanning directories...';
      case 'scraping': return scrapingType === 'series' ? 'Processing series...' : 'Processing movies...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  const getProgressDisplay = () => {
    if (phase === 'scanning') {
      return 'Counting directories...';
    }
    const itemType = scrapingType === 'series' ? 'episodes' : 'movies';
    return `${processedItems} ${itemType} discovered so far`;
  };

  const getCurrentData = () => {
    return scrapingType === 'series' ? series : movies;
  };

  const getDataCount = () => {
    return scrapingType === 'series' ? series.length : movies.length;
  };

  return (
      <div className="py-8 px-4">
        <div className="flex flex-col md:flex-row items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center">
              <Monitor className="mr-2" /> Enhanced Media Scraper
            </h1>
            <p className="text-gray-400">
              Extract movies and TV series data from online sources and import into Uniflix database
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
                <li>You have set up the enhanced scraper routes in your server.js</li>
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

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="flex space-x-1 rounded-xl bg-gray-800 p-1">
            <button
                onClick={() => setActiveTab('movies')}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'movies'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
            >
              <Film className="w-4 h-4 mr-2" />
              Movies
            </button>
            <button
                onClick={() => setActiveTab('series')}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'series'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
            >
              <Tv className="w-4 h-4 mr-2" />
              TV Series
            </button>
          </div>
        </div>

        {/* Configuration and Status Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Configuration Card */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
              {activeTab === 'movies' ? (
                  <><Film className="w-5 h-5 mr-2" /> Movie Configuration</>
              ) : (
                  <><Tv className="w-5 h-5 mr-2" /> Series Configuration</>
              )}
            </h2>

            {activeTab === 'movies' ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="movieBaseUrl" className="block text-sm font-medium text-gray-300 mb-1">
                      Movies URL to Scrape:
                    </label>
                    <div className="flex">
                      <div className="bg-gray-700 border-r border-gray-600 rounded-l-md p-2 flex items-center">
                        <Link size={16} className="text-gray-400" />
                      </div>
                      <input
                          type="text"
                          id="movieBaseUrl"
                          name="baseUrl"
                          value={movieOptions.baseUrl}
                          onChange={handleMovieInputChange}
                          placeholder="http://example.com/movies/"
                          className="bg-gray-700 border border-gray-600 text-white rounded-r-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      The scraper will recursively scan all folders for video files
                    </p>
                  </div>

                  <div>
                    <label htmlFor="movieDelay" className="block text-sm font-medium text-gray-300 mb-1">
                      Delay between requests (ms):
                    </label>
                    <input
                        type="number"
                        id="movieDelay"
                        name="delay"
                        value={movieOptions.delay}
                        onChange={handleMovieInputChange}
                        min="500"
                        className="bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                        onClick={startMovieScraping}
                        disabled={isRunning || connectionError}
                        className={`flex items-center px-4 py-2 rounded-md ${
                            isRunning || connectionError
                                ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                      <Film className="w-4 h-4 mr-2" /> Start Movie Scraping
                    </button>
                  </div>
                </div>
            ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="seriesBaseUrl" className="block text-sm font-medium text-gray-300 mb-1">
                      Series URL to Scrape:
                    </label>
                    <div className="flex">
                      <div className="bg-gray-700 border-r border-gray-600 rounded-l-md p-2 flex items-center">
                        <Link size={16} className="text-gray-400" />
                      </div>
                      <input
                          type="text"
                          id="seriesBaseUrl"
                          name="baseUrl"
                          value={seriesOptions.baseUrl}
                          onChange={handleSeriesInputChange}
                          placeholder="http://example.com/series/"
                          className="bg-gray-700 border border-gray-600 text-white rounded-r-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Expected structure: SeriesTitle/Season1/Episodes. The scraper will organize data by series → seasons → episodes
                    </p>
                  </div>

                  <div>
                    <label htmlFor="seriesDelay" className="block text-sm font-medium text-gray-300 mb-1">
                      Delay between requests (ms):
                    </label>
                    <input
                        type="number"
                        id="seriesDelay"
                        name="delay"
                        value={seriesOptions.delay}
                        onChange={handleSeriesInputChange}
                        min="500"
                        className="bg-gray-700 border border-gray-600 text-white rounded-md px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                        onClick={startSeriesScraping}
                        disabled={isRunning || connectionError}
                        className={`flex items-center px-4 py-2 rounded-md ${
                            isRunning || connectionError
                                ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                      <Tv className="w-4 h-4 mr-2" /> Start Series Scraping
                    </button>
                  </div>
                </div>
            )}

            {/* Common Controls */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700 mt-4">
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
                  disabled={(getDataCount() === 0 && errors.length === 0) || connectionError}
                  className={`flex items-center px-4 py-2 rounded-md ${
                      (getDataCount() === 0 && errors.length === 0) || connectionError
                          ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
              >
                <Download className="w-4 h-4 mr-2" /> Download Excel
              </button>
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Status</h2>

            <div className={`rounded-md p-4 ${isRunning ? 'bg-blue-900/30' : 'bg-gray-700/50'}`}>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300 font-medium">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-sm flex items-center ${
                      isRunning
                          ? 'bg-blue-900/50 text-blue-200'
                          : getDataCount() > 0
                              ? 'bg-green-900/50 text-green-200'
                              : 'bg-gray-600 text-gray-300'
                  }`}>
                  {scrapingType === 'series' ? <Tv className="w-3 h-3 mr-1" /> : <Film className="w-3 h-3 mr-1" />}
                    {getPhaseDisplay()}
                </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-300 font-medium">Type:</span>
                  <span className="text-gray-300 capitalize">{scrapingType}</span>
                </div>

                {(isRunning || phase === 'complete') && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300 font-medium">Progress:</span>
                        <span className="text-gray-300">{getProgressDisplay()}</span>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">
                        {phase === 'scanning' ? 'Scanning...' : `Current: ${currentCategory || 'Processing...'}`}
                      </span>
                          <span className="text-gray-400">{progress}%</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                      </div>

                      {currentItem && (
                          <div className="text-sm text-gray-400 mt-2">
                            <span>Current: {currentItem}</span>
                          </div>
                      )}
                    </>
                )}

                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-300 font-medium">Successfully Found:</span>
                  <span className="text-green-400">{getDataCount()}</span>
                </div>

                {errors.length > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 font-medium">Failed:</span>
                      <span className="text-red-400">{errors.length}</span>
                    </div>
                )}
              </div>
            </div>

            {/* Failed items summary */}
            {errors.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-red-400 font-medium flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Failed Items ({errors.length})
                    </h3>
                    <button
                        onClick={() => setShowFailedItems(!showFailedItems)}
                        className="text-gray-400 hover:text-gray-300 p-1"
                    >
                      {showFailedItems ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {showFailedItems && (
                      <div className="bg-red-900/20 border border-red-900/30 rounded-md p-3 max-h-40 overflow-y-auto">
                        <div className="space-y-1">
                          {errors.slice(0, 10).map((error, index) => (
                              <div key={index} className="text-red-300 text-sm flex justify-between">
                                <span className="truncate mr-2">{error.title}</span>
                                <span className="text-red-400 flex-shrink-0">({error.year})</span>
                              </div>
                          ))}
                        </div>
                        {errors.length > 10 && (
                            <p className="text-gray-400 text-xs mt-2 text-center">
                              Showing 10 of {errors.length} failed items. Download Excel for complete list.
                            </p>
                        )}
                      </div>
                  )}
                </div>
            )}
          </div>
        </div>

        {/* Results Table */}
        {getCurrentData().length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700 overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                  {scrapingType === 'series' ? 'Successfully Scraped Episodes' : 'Successfully Scraped Movies'}
                  <span className="ml-2 px-2 py-0.5 bg-gray-700 rounded-full text-sm text-gray-300">
                {getCurrentData().length}
              </span>
                </h2>
              </div>

              <div className="overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                {scrapingType === 'series' ? (
                    <table className="min-w-full divide-y divide-gray-700">
                      <thead className="bg-gray-700/50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Series
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Season
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Episode
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Episode Title
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                          Download URL
                        </th>
                      </tr>
                      </thead>
                      <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {series.slice(-20).reverse().map((episode, index) => (
                          <tr key={index} className="hover:bg-gray-700/50">
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-white">
                              {episode.serie_title} {episode.serie_year && `(${episode.serie_year})`}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">
                              S{episode.season_number}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-300">
                              E{episode.episode_number}
                            </td>
                            <td className="px-3 py-2 text-sm text-white max-w-xs truncate">
                              {episode.episode_title}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-300 max-w-xs truncate">
                              <div className="truncate max-w-xs" title={episode.download_url}>
                                {episode.download_url}
                              </div>
                            </td>
                          </tr>
                      ))}
                      </tbody>
                    </table>
                ) : (
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
                              {movie.release_year || 'Unknown'}
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
                )}
              </div>

              <p className="text-gray-400 text-xs mt-4">
                Showing most recent 20 {scrapingType === 'series' ? 'episodes' : 'movies'} of {getCurrentData().length} total (newest first)
              </p>
            </div>
        )}

        {/* Summary when complete */}
        {phase === 'complete' && !isRunning && (getCurrentData().length > 0 || errors.length > 0) && (
            <div className="mt-6 bg-gray-800 rounded-lg p-6 shadow-md border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                {scrapingType === 'series' ? 'Series Scraping Complete' : 'Movie Scraping Complete'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-900/20 border border-green-900/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{getCurrentData().length}</div>
                  <div className="text-green-300 text-sm">
                    Successfully Scraped {scrapingType === 'series' ? 'Episodes' : 'Movies'}
                  </div>
                </div>

                <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{errors.length}</div>
                  <div className="text-red-300 text-sm">Failed to Process</div>
                </div>

                <div className="bg-blue-900/20 border border-blue-900/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">{totalItems}</div>
                  <div className="text-blue-300 text-sm">Total Discovered</div>
                </div>
              </div>

              {scrapingType === 'series' && series.length > 0 && (
                  <div className="mt-4 p-4 bg-blue-900/20 border border-blue-900/30 rounded-lg">
                    <h4 className="text-blue-300 font-medium mb-2">Series Summary:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">
                          {new Set(series.map(ep => ep.serie_title)).size}
                        </div>
                        <div className="text-blue-300">Unique Series</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">
                          {new Set(series.map(ep => `${ep.serie_title}_S${ep.season_number}`)).size}
                        </div>
                        <div className="text-blue-300">Total Seasons</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">{series.length}</div>
                        <div className="text-blue-300">Total Episodes</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">
                          {Math.round(series.length / new Set(series.map(ep => ep.serie_title)).size)}
                        </div>
                        <div className="text-blue-300">Avg Episodes/Series</div>
                      </div>
                    </div>
                  </div>
              )}

              <div className="mt-4 flex justify-center">
                <button
                    onClick={downloadExcel}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-md flex items-center"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download Complete Report (Excel)
                </button>
              </div>
            </div>
        )}
      </div>
  );
}