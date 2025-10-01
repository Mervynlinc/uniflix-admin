import axios from 'axios';
import * as cheerio from 'cheerio';
import xlsx from 'xlsx';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import express from 'express';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global variables to track scraping status for both movies and series
const scrapingStatus = {
    isRunning: false,
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    currentCategory: '',
    currentItem: '',
    movies: [],
    series: [], // New for series data
    errors: [],
    phase: 'idle',
    type: 'movies' // 'movies' or 'series'
};

class EnhancedScraper {
    constructor(baseUrl = 'http://103.145.232.246/Data/movies/Hollywood/') {
        this.baseUrl = baseUrl;
        this.movies = [];
        this.series = [];
        this.failedItems = [];
        this.delay = 1000;
        this.pendingLinks = [];
        this.processedUrls = new Set();
        this.videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'mpg', 'mpeg'];
        this.totalVideoFiles = 0;
        this.processedVideoFiles = 0;
    }

    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async fetchPage(url) {
        try {
            if (this.processedUrls.has(url)) {
                return null;
            }

            this.processedUrls.add(url);

            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching ${url}:`, error.message);
            return null;
        }
    }

    isVideoFile(url) {
        const extension = url.split('.').pop().toLowerCase();
        return this.videoExtensions.includes(extension);
    }

    getFolderName(url) {
        // Handle URLs with or without trailing slash
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const parts = cleanUrl.split('/');
        
        // Get the last part of the path (current folder name)
        const folderName = parts[parts.length - 1] || 'Unknown';
        
        // If it looks like a season folder (S1, Season 1, etc.), try to find the parent folder
        if (/^(s\d+|season\s*\d+)$/i.test(folderName) && parts.length > 1) {
            // Return the parent folder name instead (the actual series name)
            return decodeURIComponent(parts[parts.length - 2] || folderName);
        }
        
        return decodeURIComponent(folderName);
    }

    parseMovieInfo(filename, folderPath) {
        const decodedFilename = decodeURIComponent(filename);
        const decodedFolderPath = decodeURIComponent(folderPath);

        // 1. Try to extract from the folder name first
        const folderNameMatch = decodedFolderPath.match(/\/([^\/]+)\s*\((\d{4})\)\/[^\/]*$/);
        if (folderNameMatch) {
            return {
                title: folderNameMatch[1].trim().replace(/\./g, ' '),
                year: folderNameMatch[2]
            };
        }

        // 2. Try to extract year from folder with dot separators
        const dotYearMatch = decodedFolderPath.match(/\/([^\/]+)\.(\d{4})\.[^\/]*$/);
        if (dotYearMatch) {
            return {
                title: dotYearMatch[1].replace(/\./g, ' ').trim(),
                year: dotYearMatch[2]
            };
        }

        // 3. Try to extract from filename
        const nameWithoutExt = decodedFilename.replace(/\.[^/.]+$/, "");

        const filenameYearMatch = nameWithoutExt.match(/(.+)\s*\((\d{4})\)$/);
        if (filenameYearMatch) {
            return {
                title: filenameYearMatch[1].trim().replace(/\./g, ' '),
                year: filenameYearMatch[2]
            };
        }

        const filenameDotYearMatch = nameWithoutExt.match(/(.+)\.(\d{4})$/);
        if (filenameDotYearMatch) {
            return {
                title: filenameDotYearMatch[1].replace(/\./g, ' ').trim(),
                year: filenameDotYearMatch[2]
            };
        }

        // 4. Last resort: Look for 4 digits that could be a year
        const yearDigits = decodedFolderPath.match(/(\d{4})/);
        if (yearDigits) {
            const pathParts = decodedFolderPath.split('/');
            const folderName = pathParts[pathParts.length - 2] || '';

            return {
                title: folderName.replace(/\.\d{4}\..+$/g, '').replace(/\./g, ' ').trim(),
                year: yearDigits[1]
            };
        }

        return {
            title: nameWithoutExt.replace(/\./g, ' ').trim(),
            year: ''
        };
    }

    // NEW: Parse series information from directory structure
    parseSeriesInfo(serieTitle, seasonFolder, episodeFilename, fullPath) {
        const decodedTitle = decodeURIComponent(serieTitle);
        const decodedSeason = decodeURIComponent(seasonFolder);
        const decodedEpisode = decodeURIComponent(episodeFilename);

        // Extract series title and year
        let title = decodedTitle.replace(/\./g, ' ').replace(/%20/g, ' ').trim();
        let year = '';

        // Try to extract year from series title
        const yearMatch = title.match(/(.+?)\s*\((\d{4})\)$/);
        if (yearMatch) {
            title = yearMatch[1].trim();
            year = yearMatch[2];
        } else {
            const yearDigits = title.match(/(\d{4})/);
            if (yearDigits) {
                year = yearDigits[1];
                title = title.replace(/\d{4}/, '').trim();
            }
        }

        // Extract season number with improved detection
        let seasonNumber = 1;
        const seasonPatterns = [
            /^s(\d+)$/i,           // Match "s1", "S2" exactly - FIRST PRIORITY
            /season\s*(\d+)/i,     // Match "season 1", "season1"
            /(\d+)/               // Match any number as last resort
        ];

        for (const pattern of seasonPatterns) {
            const match = decodedSeason.match(pattern);
            if (match) {
                seasonNumber = parseInt(match[1]);
                break;
            }
        }

        // Extract episode information with more patterns
        const nameWithoutExt = decodedEpisode.replace(/\.[^/.]+$/, "");
        let episodeNumber = 1;
        let episodeTitle = nameWithoutExt;

        // Enhanced episode patterns
        const episodePatterns = [
            /S\d+E(\d+)[\s\-\.]*(.*)$/i,  // S01E01 - Title
            /(\d+)x(\d+)[\s\-\.]*(.*)$/,    // 1x01 - Title
            /E(\d+)[\s\-\.]*(.*)$/i,      // E01 - Title
            /Episode\s*(\d+)[\s\-\.]*(.*)$/i, // Episode 01 - Title
            /^(\d+)[\s\-\.](.*)$/,        // 01 - Title (starting with number)
            /^(\d+)$/                     // Just a number
        ];

        for (const pattern of episodePatterns) {
            const match = nameWithoutExt.match(pattern);
            if (match) {
                episodeNumber = parseInt(match[1]);
                if (match[2] && match[2].trim()) {
                    episodeTitle = match[2].trim().replace(/^[\s\-\.]+/, '');
                } else if (match.length > 2 && match[match.length - 1] && match[match.length - 1].trim()) {
                    episodeTitle = match[match.length - 1].trim().replace(/^[\s\-\.]+/, '');
                }
                break;
            }
        }

        // Clean up episode title
        if (!episodeTitle || /^\d+$/.test(episodeTitle) || episodeTitle === nameWithoutExt) {
            episodeTitle = `Episode ${episodeNumber}`;
        }

        return {
            serieTitle: title,
            year: year,
            seasonNumber: seasonNumber,
            seasonTitle: `Season ${seasonNumber}`,
            episodeNumber: episodeNumber,
            episodeTitle: episodeTitle
        };
    }

    // --- BEGIN ENHANCED SERIES STRUCTURE DETECTION LOGIC ---

    // Detect if URL points to a single series or multiple series directory
    async detectSeriesStructure(url) {
        console.log(`Detecting structure for: ${url}`);
        
        const html = await this.fetchPage(url);
        if (!html) {
            throw new Error(`Cannot access URL: ${url}`);
        }

        const $ = cheerio.load(html);
        const links = [];

        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (!href || href === '../' || href === '..' || href.startsWith('../') || href.startsWith('/')) {
                return;
            }

            const fullUrl = new URL(href, url).toString();
            if (!fullUrl.startsWith(this.baseUrl)) {
                return;
            }

            if (href.endsWith('/')) {
                links.push({ 
                    url: fullUrl, 
                    isDirectory: true, 
                    name: decodeURIComponent(href.slice(0, -1)),
                    originalHref: href
                });
            } else {
                links.push({ 
                    url: fullUrl, 
                    isDirectory: false, 
                    name: decodeURIComponent(href),
                    originalHref: href
                });
            }
        });

        // Check if this looks like a single series directory
        const seasonFolders = links.filter(link => 
            link.isDirectory && 
            (/season\s*\d+/i.test(link.name) || /^s\d+$/i.test(link.name))
        );

        const videoFiles = links.filter(link => 
            !link.isDirectory && 
            this.isVideoFile(link.url)
        );

        if (seasonFolders.length > 0) {
            // Single series with season folders
            console.log(`Detected single series structure with ${seasonFolders.length} seasons`);
            return {
                type: 'single_series',
                seriesName: this.getFolderName(url),
                seasons: seasonFolders,
                directEpisodes: videoFiles,
                allLinks: links
            };
        } else if (videoFiles.length > 0) {
            // Single season folder with episodes
            console.log(`Detected single season with ${videoFiles.length} episodes`);
            return {
                type: 'single_season',
                seriesName: this.extractSeriesNameFromPath(url),
                seasonName: this.getFolderName(url),
                episodes: videoFiles,
                allLinks: links
            };
        } else {
            // Multi-series directory
            const seriesFolders = links.filter(link => link.isDirectory);
            console.log(`Detected multi-series directory with ${seriesFolders.length} potential series`);
            return {
                type: 'multi_series',
                series: seriesFolders,
                allLinks: links
            };
        }
    }

    // Helper to extract series name from URL path
    extractSeriesNameFromPath(url) {
        // First decode the URL to handle percent-encoded characters
        const decodedUrl = decodeURIComponent(url);
        
        // Look for TV show patterns in the URL
        const tvShowPatterns = [
            /\/Tv_Shows\/[^\/]+\/([^\/]+)\//i,    // Match /Tv_Shows/Language/SeriesName/
            /\/TV[^\/]*\/([^\/]+)\//i,             // Match /TV/SeriesName/
            /\/Series\/[^\/]+\/([^\/]+)\//i        // Match /Series/Language/SeriesName/
        ];
        
        // Try each pattern
        for (const pattern of tvShowPatterns) {
            const match = decodedUrl.match(pattern);
            if (match && match[1]) {
                return match[1].replace(/%20/g, ' ').replace(/\./g, ' ').trim();
            }
        }
        
        // Fall back to regular path parsing if no TV show pattern matched
        const pathParts = decodedUrl.split('/').filter(part => part);
        
        // Try to find a part that's not a season folder
        for (let i = pathParts.length - 1; i >= 0; i--) {
            const part = pathParts[i];
            // Skip if it looks like a season folder
            if (part && !/^(s\d+|season\s*\d+)$/i.test(part)) {
                return part.replace(/%20/g, ' ').replace(/\./g, ' ').trim();
            }
        }
        
        return 'Unknown Series';
    }

    // ENHANCED: Series scraping method with structure detection
    async scrapeSeries(options = {}) {
        const { baseUrl, delay, mode = 'auto' } = options;

        // Reset status for series
        scrapingStatus.isRunning = true;
        scrapingStatus.progress = 0;
        scrapingStatus.processedItems = 0;
        scrapingStatus.totalItems = 0;
        scrapingStatus.series = [];
        scrapingStatus.errors = [];
        scrapingStatus.phase = 'scanning';
        scrapingStatus.type = 'series';
        scrapingStatus.currentCategory = 'Analyzing directory structure...';

        // Reset scraper
        this.series = [];
        this.failedItems = [];
        this.processedUrls = new Set();
        this.baseUrl = baseUrl || this.baseUrl;

        if (delay) {
            this.delay = delay;
        }

        try {
            console.log('Analyzing directory structure...');
            const structure = await this.detectSeriesStructure(this.baseUrl);
            scrapingStatus.phase = 'scaping';
            scrapingStatus.currentCategory = `Processing ${structure.type} structure`;

            switch (structure.type) {
                case 'single_series':
                    console.log('Processing single series with seasons...');
                    await this.processSingleSeries(this.baseUrl, structure);
                    break;
                case 'single_season':
                    console.log('Processing single season...');
                    await this.processSingleSeason(this.baseUrl, structure);
                    break;
                case 'multi_series':
                    console.log('Processing multiple series directory...');
                    await this.processMultiSeries(this.baseUrl, structure);
                    break;
                default:
                    console.log('Falling back to original crawling method...');
                    await this.crawlSeriesDirectory(this.baseUrl);
            }

            scrapingStatus.progress = 100;
            scrapingStatus.phase = 'complete';

            console.log(`Series scraping complete: ${this.series.length} episodes found, ${this.failedItems.length} failed`);
            return this.series;
        } catch (error) {
            console.error("Series scraping failed:", error);
            scrapingStatus.phase = 'error';
            scrapingStatus.currentCategory = `Error: ${error.message}`;
            throw error;
        } finally {
            scrapingStatus.isRunning = false;
        }
    }

    // Process a single series directory (like Game of Thrones)
    async processSingleSeries(baseUrl, structure) {
        const seriesTitle = structure.seriesName;
        scrapingStatus.currentCategory = `Serie: ${seriesTitle}`;
        console.log(`Processing single series: ${seriesTitle}`);

        // Process each season folder
        for (const seasonFolder of structure.seasons) {
            if (!scrapingStatus.isRunning) break;
            scrapingStatus.currentItem = `${seriesTitle} - ${seasonFolder.name}`;
            console.log(`Processing season: ${seasonFolder.url}`);
            await this.processSeasonFolder(seasonFolder.url, seriesTitle, seasonFolder.name);
            await this.sleep(this.delay);
        }

        // Also process any direct episodes (in case there are episodes in the root series folder)
        if (structure.directEpisodes.length > 0) {
            await this.processEpisodesInFolder(structure.directEpisodes, seriesTitle, 'Season 1', baseUrl);
        }
    }

    // Process a single season folder
    async processSingleSeason(baseUrl, structure) {
        const seriesTitle = structure.seriesName;
        const seasonName = structure.seasonName;
        scrapingStatus.currentCategory = `Serie: ${seriesTitle}`;
        scrapingStatus.currentItem = `${seriesTitle} - ${seasonName}`;
        console.log(`Processing single season: ${seriesTitle} - ${seasonName}`);
        await this.processEpisodesInFolder(structure.episodes, seriesTitle, seasonName, baseUrl);
    }

    // Process multiple series directory
    async processMultiSeries(baseUrl, structure) {
        scrapingStatus.currentCategory = 'Multiple series directory';
        for (const seriesFolder of structure.series) {
            if (!scrapingStatus.isRunning) break;
            console.log(`Processing series folder: ${seriesFolder.url}`);
            await this.processSingleSeriesRecursive(seriesFolder.url, seriesFolder.name);
            await this.sleep(this.delay);
        }
    }

    // Recursively process a single series (for multi-series directories)
    async processSingleSeriesRecursive(seriesUrl, seriesName) {
        const structure = await this.detectSeriesStructure(seriesUrl);
        if (structure.type === 'single_series') {
            await this.processSingleSeries(seriesUrl, structure);
        } else if (structure.type === 'single_season') {
            await this.processSingleSeason(seriesUrl, structure);
        } else {
            await this.crawlSeriesDirectory(seriesUrl, 0, 10, seriesName, '');
        }
    }

    // Process a season folder and extract episodes
    async processSeasonFolder(seasonUrl, seriesTitle, seasonName) {
        console.log(`DEBUG: Processing season folder "${seasonName}" for series "${seriesTitle}"`);
        
        // If season name doesn't contain numbers, try to extract from URL
        if (!/\d+/i.test(seasonName)) {
            const urlParts = seasonUrl.split('/');
            const lastPart = urlParts[urlParts.length - 2] || '';
            console.log(`DEBUG: Season name has no digit, URL part is: "${lastPart}"`);
        }
        
        const html = await this.fetchPage(seasonUrl);
        if (!html) return;

        const $ = cheerio.load(html);
        const episodes = [];

        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (!href || href === '../' || href === '..' || href.startsWith('../') || href.startsWith('/')) {
                return;
            }

            const fullUrl = new URL(href, seasonUrl).toString();
            if (!fullUrl.startsWith(this.baseUrl)) {
                return;
            }

            if (!href.endsWith('/') && this.isVideoFile(fullUrl)) {
                episodes.push({
                    url: fullUrl,
                    name: decodeURIComponent(href)
                });
            }
        });

        await this.processEpisodesInFolder(episodes, seriesTitle, seasonName, seasonUrl);
    }

    // Process episodes within a folder
    async processEpisodesInFolder(episodes, seriesTitle, seasonName, folderUrl) {
        console.log(`Processing ${episodes.length} episodes in ${seriesTitle} - ${seasonName}`);
        for (const episode of episodes) {
            if (!scrapingStatus.isRunning) break;
            try {
                const seriesInfo = this.parseSeriesInfo(seriesTitle, seasonName, episode.name, episode.url);
                scrapingStatus.currentItem = `${seriesInfo.serieTitle} - S${seriesInfo.seasonNumber}E${seriesInfo.episodeNumber}`;
                const episodeData = {
                    serie_title: seriesInfo.serieTitle,
                    serie_year: seriesInfo.year,
                    season_number: seriesInfo.seasonNumber,
                    season_title: seriesInfo.seasonTitle,
                    episode_number: seriesInfo.episodeNumber,
                    episode_title: seriesInfo.episodeTitle,
                    episode_description: '',
                    duration: '',
                    release_date: '',
                    download_url: episode.url,
                    rating: '',
                    image_url: '',
                    tmdb_id: '',
                    download_count: '0'
                };
                
                // FIX: Add to only ONE array, not both
                this.series.push(episodeData);
                // REMOVE THIS LINE: scrapingStatus.series.push(episodeData);
                
                this.processedVideoFiles++;
                scrapingStatus.processedItems = this.processedVideoFiles;
                scrapingStatus.totalItems = this.processedVideoFiles;
                scrapingStatus.progress = Math.min(100, this.processedVideoFiles);
                console.log(`Processed: ${seriesInfo.serieTitle} S${seriesInfo.seasonNumber}E${seriesInfo.episodeNumber} - ${seriesInfo.episodeTitle}`);
            } catch (error) {
                console.error(`Failed to process episode: ${episode.url}`, error);
                const seriesInfo = this.parseSeriesInfo(seriesTitle, seasonName, episode.name, episode.url);
                this.failedItems.push({
                    title: `${seriesInfo.serieTitle} - S${seriesInfo.seasonNumber}E${seriesInfo.episodeNumber}`,
                    year: seriesInfo.year || 'Unknown',
                    url: episode.url,
                    error: error.message
                });
                scrapingStatus.errors.push({
                    title: `${seriesInfo.serieTitle} - S${seriesInfo.seasonNumber}E${seriesInfo.episodeNumber}`,
                    year: seriesInfo.year || 'Unknown'
                });
            }
            await this.sleep(this.delay);
        }
    }

    // Add this method to the EnhancedScraper class
    async scrapeMovies(options = {}) {
        const { baseUrl, delay } = options;

        // Reset status for movies
        scrapingStatus.isRunning = true;
        scrapingStatus.progress = 0;
        scrapingStatus.processedItems = 0;
        scrapingStatus.totalItems = 0;
        scrapingStatus.movies = [];
        scrapingStatus.errors = [];
        scrapingStatus.phase = 'scanning';
        scrapingStatus.type = 'movies';
        scrapingStatus.currentCategory = 'Scanning directories...';

        // Reset scraper
        this.movies = [];
        this.failedItems = [];
        this.processedUrls = new Set();
        this.processedVideoFiles = 0;
        this.baseUrl = baseUrl || this.baseUrl;

        if (delay) {
            this.delay = delay;
        }

        try {
            // Skip the two-phase approach and go directly to crawling
            scrapingStatus.phase = 'scraping';
            console.log('Processing video files...');
            await this.crawlDirectory(this.baseUrl);

            // Final progress update
            scrapingStatus.progress = 100;
            scrapingStatus.phase = 'complete';

            console.log(`Scraping complete: ${this.movies.length} successful, ${this.failedItems.length} failed`);
            return this.movies;
        } catch (error) {
            console.error("Scraping failed:", error);
            scrapingStatus.phase = 'error';
            throw error;
        } finally {
            scrapingStatus.isRunning = false;
            scrapingStatus.currentCategory = '';
            scrapingStatus.currentItem = '';
        }
    }

    // Add this method if it's missing as well
    async crawlDirectory(url, currentDepth = 0, maxDepth = 10) {
        if (currentDepth > maxDepth || !scrapingStatus.isRunning) {
            return;
        }

        const folderName = this.getFolderName(url);
        scrapingStatus.currentCategory = folderName;

        console.log(`Processing directory: ${url}`);

        const html = await this.fetchPage(url);
        if (!html) return;

        const $ = cheerio.load(html);
        const links = [];

        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (!href || href === '../' || href === '..' || href.startsWith('../') || href.startsWith('/')) {
                return;
            }

            const fullUrl = new URL(href, url).toString();
            if (!fullUrl.startsWith(this.baseUrl)) {
                return;
            }

            if (href.endsWith('/')) {
                links.push({ url: fullUrl, isDirectory: true });
            } else {
                links.push({ url: fullUrl, isDirectory: false });
            }
        });

        // Process directories first
        for (const link of links) {
            if (link.isDirectory && scrapingStatus.isRunning) {
                await this.crawlDirectory(link.url, currentDepth + 1, maxDepth);
                await this.sleep(this.delay);
            }
        }

        // Process video files
        for (const link of links) {
            if (!link.isDirectory && this.isVideoFile(link.url) && scrapingStatus.isRunning) {
                try {
                    const filename = link.url.split('/').pop();
                    scrapingStatus.currentItem = filename;
                    
                    const { title, year } = this.parseMovieInfo(filename, link.url);

                    const movieData = {
                        movie_title: title,
                        release_year: year || '',
                        release_date: '',
                        download_url: link.url,
                        plot: '',
                        duration: '',
                        rating: '',
                        image_url: '',
                        trailer: '',
                        imdb_id: '',
                        type_id: '1',
                        category_id: '',
                        download_count: '0'
                    };

                    this.movies.push(movieData);
                    scrapingStatus.movies.push(movieData);
                    this.processedVideoFiles++;

                    // Update progress
                    scrapingStatus.processedItems = this.processedVideoFiles;
                    scrapingStatus.totalItems = this.processedVideoFiles;
                    scrapingStatus.progress = Math.min(100, this.processedVideoFiles);

                } catch (error) {
                    console.error(`Failed to process movie: ${link.url}`, error);
                    const { title, year } = this.parseMovieInfo(link.url.split('/').pop(), link.url);
                    this.failedItems.push({
                        title: title,
                        year: year || 'Unknown',
                        url: link.url,
                        error: error.message
                    });
                    scrapingStatus.errors.push({
                        title: title,
                        year: year || 'Unknown'
                    });
                }

                await this.sleep(this.delay);
            }
        }
    }

    exportToExcel(filename) {
        const hasData = (this.movies.length > 0 || this.series.length > 0 || this.failedItems.length > 0);
        if (!hasData) return null;

        const downloadsDir = path.join(__dirname, 'downloads');
        if (!existsSync(downloadsDir)) {
            mkdirSync(downloadsDir);
        }

        const wb = xlsx.utils.book_new();

        // Add movies sheet if available
        if (this.movies.length > 0) {
            const ws = xlsx.utils.json_to_sheet(this.movies);
            xlsx.utils.book_append_sheet(wb, ws, 'Movies');
        }

        // Add series sheets if available
        if (this.series.length > 0) {
            // 1. Series sheet - prepare data to match Serie table
            const seriesSummary = this.generateSeriesSummary().map(series => ({
                serie_title: series.serie_title,
                release_year: series.serie_year,
                description: '', // Will be filled by enrichment
                total_seasons: series.total_seasons,
                total_episodes: series.total_episodes,
                rating: '', // Will be filled by enrichment
                image_url: '', // Will be filled by enrichment
                trailer: '', // Will be filled by enrichment
                type_id: 2, // Assuming 2 is for Series
                tmdb_id: '' // Will be filled by enrichment
            }));
            
            if (seriesSummary.length > 0) {
                const seriesWs = xlsx.utils.json_to_sheet(seriesSummary);
                xlsx.utils.book_append_sheet(wb, seriesWs, 'Serie');
            }
            
            // 2. Seasons sheet - prepare data to match Season table
            const seasonsSummary = this.generateSeasonsSummary().map(season => ({
                serie_title: season.serie_title, // For linking
                season_number: season.season_number,
                season_title: season.season_title,
                season_description: '', // Will be filled by enrichment
                episode_count: season.total_episodes,
                image_url: '', // Will be filled by enrichment
                trailer: '' // Will be filled by enrichment
            }));
            
            if (seasonsSummary.length > 0) {
                const seasonsWs = xlsx.utils.json_to_sheet(seasonsSummary);
                xlsx.utils.book_append_sheet(wb, seasonsWs, 'Season');
            }
            
            // 3. Episodes sheet - prepare data to match Episodes table
            const episodes = this.series.map(episode => ({
                serie_title: episode.serie_title, // For linking
                season_number: episode.season_number, // For linking
                episode_number: episode.episode_number,
                episode_title: episode.episode_title,
                episode_description: '', // Will be filled by enrichment
                duration: '', // Will be filled by enrichment
                release_date: '', // Will be filled by enrichment
                download_url: episode.download_url,
                rating: '', // Will be filled by enrichment
                image_url: '', // Will be filled by enrichment
                tmdb_id: '' // Will be filled by enrichment
            }));
            
            const episodesWs = xlsx.utils.json_to_sheet(episodes);
            xlsx.utils.book_append_sheet(wb, episodesWs, 'Episodes');
        }

        // Add failed items sheet
        if (this.failedItems.length > 0) {
            const failedSheet = xlsx.utils.json_to_sheet(this.failedItems);
            xlsx.utils.book_append_sheet(wb, failedSheet, 'Failed Items');
        }

        const filepath = path.join(downloadsDir, filename);
        xlsx.writeFile(wb, filepath);

        return filepath;
    }

    // NEW: Generate series summary for Excel export
    generateSeriesSummary() {
        const seriesMap = new Map();

        // Log before counting to help debug
        console.log(`Total episodes being processed: ${this.series.length}`);
        
        this.series.forEach(episode => {
            const key = `${episode.serie_title}_${episode.serie_year}`;
            
            if (!seriesMap.has(key)) {
                seriesMap.set(key, {
                    serie_title: episode.serie_title,
                    serie_year: episode.serie_year,
                    total_seasons: new Set(),
                    total_episodes: 0,
                    seasons: new Map()
                });
            }

            const serie = seriesMap.get(key);
            serie.total_seasons.add(parseInt(episode.season_number)); // Force integer conversion
            serie.total_episodes++;

            const seasonKey = episode.season_number;
            if (!serie.seasons.has(seasonKey)) {
                serie.seasons.set(seasonKey, 0);
            }
            serie.seasons.set(seasonKey, serie.seasons.get(seasonKey) + 1);
        });

        // Log season counts for debugging
        seriesMap.forEach((data, key) => {
            console.log(`Series: ${key}, Total seasons: ${data.total_seasons.size}`);
            console.log(`Unique season numbers: ${[...data.total_seasons].join(', ')}`);
        });

        return Array.from(seriesMap.values()).map(serie => ({
            serie_title: serie.serie_title,
            serie_year: serie.serie_year,
            total_seasons: serie.total_seasons.size,
            total_episodes: serie.total_episodes,
            season_details: Array.from(serie.seasons.entries())
                .map(([season, episodes]) => `S${season}: ${episodes} episodes`)
                .join(', ')
        }));
    }

    // NEW: Generate seasons summary for Excel export
    generateSeasonsSummary() {
        const seasonsMap = new Map();

        this.series.forEach(episode => {
            const key = `${episode.serie_title}_${episode.serie_year}_${episode.season_number}`;
            
            if (!seasonsMap.has(key)) {
                seasonsMap.set(key, {
                    serie_title: episode.serie_title,
                    serie_year: episode.serie_year,
                    season_number: episode.season_number,
                    season_title: episode.season_title,
                    total_episodes: 0
                });
            }

            const season = seasonsMap.get(key);
            season.total_episodes++;
        });

        return Array.from(seasonsMap.values());
    }

    getFailedItems() {
        return this.failedItems;
    }
}

// Create scraper instance
const scraper = new EnhancedScraper();

// Function to verify JWT token from query parameter
const verifyTokenFromQuery = (req, res, next) => {
    const token = req.query.token;

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

// ENHANCED: Set up routes for Express server
export function setupScraperRoutes(app) {
    app.use('/api/scraper', cors());

    // API Routes
    app.get('/api/scraper/status', (req, res) => {
        res.json(scrapingStatus);
    });

    // EXISTING: Movies scraping endpoint
    app.post('/api/scraper/scrape', async (req, res) => {
        if (scrapingStatus.isRunning) {
            return res.status(400).json({ error: 'Scraping already in progress' });
        }

        const options = req.body;

        if (options.baseUrl) {
            try {
                new URL(options.baseUrl);
            } catch (error) {
                return res.status(400).json({ error: 'Invalid URL format' });
            }

            if (!options.baseUrl.endsWith('/')) {
                options.baseUrl += '/';
            }
        }

        // Start movie scraping in background
        scraper.scrapeMovies(options).catch(error => {
            console.error('Movie scraping failed:', error);
            scrapingStatus.isRunning = false;
            scrapingStatus.phase = 'error';
        });

        res.json({ message: 'Movie scraping started' });
    });

    // NEW: Series scraping endpoint
    app.post('/api/scraper/scrape-series', async (req, res) => {
        if (scrapingStatus.isRunning) {
            return res.status(400).json({ error: 'Scraping already in progress' });
        }

        const options = req.body;

        if (options.baseUrl) {
            try {
                new URL(options.baseUrl);
            } catch (error) {
                return res.status(400).json({ error: 'Invalid URL format' });
            }

            if (!options.baseUrl.endsWith('/')) {
                options.baseUrl += '/';
            }
        }

        // Start series scraping in background
        scraper.scrapeSeries(options).catch(error => {
            console.error('Series scraping failed:', error);
            scrapingStatus.isRunning = false;
            scrapingStatus.phase = 'error';
        });

        res.json({ message: 'Series scraping started' });
    });

    app.post('/api/scraper/stop', (req, res) => {
        scrapingStatus.isRunning = false;
        res.json({ message: 'Scraping stopped' });
    });

    app.get('/api/scraper/download', verifyTokenFromQuery, (req, res) => {
        const hasData = (scrapingStatus.movies.length > 0 || 
                        scrapingStatus.series.length > 0 || 
                        scraper.getFailedItems().length > 0);
        
        if (!hasData) {
            return res.status(400).json({ error: 'No data to download' });
        }

        const type = scrapingStatus.type === 'series' ? 'series' : 'movies';
        const filename = `${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = scraper.exportToExcel(filename);

        if (filepath) {
            res.download(filepath, filename);
        } else {
            res.status(500).json({ error: 'Failed to create Excel file' });
        }
    });

    app.get('/api/scraper/failed-items', (req, res) => {
        res.json(scraper.getFailedItems());
    });

    app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

    console.log('🎬 Enhanced Movie & Series scraper routes configured');
}