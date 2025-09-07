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

// Global variables to track scraping status
const scrapingStatus = {
    isRunning: false,
    progress: 0,
    totalMovies: 0,
    processedMovies: 0,
    currentCategory: '',
    currentMovie: '',
    movies: [],
    errors: [], // Will store failed movies with title and year
    phase: 'idle' // 'scanning', 'scraping', 'complete'
};

class MovieScraper {
    constructor(baseUrl = 'http://103.145.232.246/Data/movies/Hollywood/') {
        this.baseUrl = baseUrl;
        this.movies = [];
        this.failedMovies = []; // Store failed movies
        this.delay = 1000;
        this.pendingLinks = [];
        this.processedUrls = new Set();
        this.videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'mpg', 'mpeg'];
        this.totalVideoFiles = 0; // Track total video files found
        this.processedVideoFiles = 0; // Track processed video files
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
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const parts = cleanUrl.split('/');
        return parts[parts.length - 1] || 'Unknown';
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

    // Phase 1: Count all video files first
    async countVideoFiles(url, currentDepth = 0, maxDepth = 10) {
        if (currentDepth > maxDepth || !scrapingStatus.isRunning) {
            return 0;
        }

        console.log(`Scanning directory for count: ${url}`);

        const html = await this.fetchPage(url);
        if (!html) return 0;

        const $ = cheerio.load(html);
        const links = [];
        let videoCount = 0;

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
            } else if (this.isVideoFile(fullUrl)) {
                videoCount++;
            }
        });

        // Recursively count in subdirectories
        for (const link of links) {
            if (link.isDirectory && scrapingStatus.isRunning) {
                videoCount += await this.countVideoFiles(link.url, currentDepth + 1, maxDepth);
            }
        }

        return videoCount;
    }

    // Phase 2: Crawl and process video files
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
                    const { title, year } = this.parseMovieInfo(filename, link.url);

                    scrapingStatus.currentMovie = `${title} (${year || 'Unknown Year'})`;

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

                    // Update progress without needing total count
                    scrapingStatus.processedMovies = this.processedVideoFiles;
                    scrapingStatus.totalMovies = this.processedVideoFiles; // Set total to processed count
                    scrapingStatus.progress = Math.min(100, this.processedVideoFiles); // Simple increment

                } catch (error) {
                    console.error(`Failed to process movie: ${link.url}`, error);
                    const { title, year } = this.parseMovieInfo(link.url.split('/').pop(), link.url);
                    this.failedMovies.push({
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

    async scrapeMovies(options = {}) {
        const { baseUrl, delay } = options;

        // Reset status
        scrapingStatus.isRunning = true;
        scrapingStatus.progress = 0;
        scrapingStatus.processedMovies = 0;
        scrapingStatus.totalMovies = 0;
        scrapingStatus.movies = [];
        scrapingStatus.errors = [];
        scrapingStatus.phase = 'scraping'; // Skip scanning phase

        // Reset scraper
        this.movies = [];
        this.failedMovies = [];
        this.processedUrls = new Set();
        this.baseUrl = baseUrl || this.baseUrl;

        if (delay) {
            this.delay = delay;
        }

        try {
            // Skip Phase 1 (scanning) and go directly to Phase 2
            console.log('Processing video files...');
            await this.crawlDirectory(this.baseUrl);

            // Final progress update
            scrapingStatus.progress = 100;
            scrapingStatus.phase = 'complete';

            console.log(`Scraping complete: ${this.movies.length} successful, ${this.failedMovies.length} failed`);
            return this.movies;
        } catch (error) {
            console.error("Scraping failed:", error);
            scrapingStatus.phase = 'error';
            throw error;
        } finally {
            scrapingStatus.isRunning = false;
            scrapingStatus.currentCategory = '';
            scrapingStatus.currentMovie = '';
        }
    }

    exportToExcel(filename) {
        if (this.movies.length === 0 && this.failedMovies.length === 0) return null;

        const downloadsDir = path.join(__dirname, 'downloads');
        if (!existsSync(downloadsDir)) {
            mkdirSync(downloadsDir);
        }

        const wb = xlsx.utils.book_new();

        // Add successful movies sheet
        if (this.movies.length > 0) {
            const ws = xlsx.utils.json_to_sheet(this.movies);
            xlsx.utils.book_append_sheet(wb, ws, 'Movies');
        }

        // Add failed movies sheet
        if (this.failedMovies.length > 0) {
            const failedSheet = xlsx.utils.json_to_sheet(this.failedMovies);
            xlsx.utils.book_append_sheet(wb, failedSheet, 'Failed Movies');
        }

        const filepath = path.join(downloadsDir, filename);
        xlsx.writeFile(wb, filepath);

        return filepath;
    }

    // Method to get failed movies
    getFailedMovies() {
        return this.failedMovies;
    }
}

// Create scraper instance
const scraper = new MovieScraper();

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

// Set up routes for Express server
export function setupScraperRoutes(app) {
    app.use('/api/scraper', cors());

    // API Routes
    app.get('/api/scraper/status', (req, res) => {
        res.json(scrapingStatus);
    });

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

        // Start scraping in background
        scraper.scrapeMovies(options).catch(error => {
            console.error('Scraping failed:', error);
            scrapingStatus.isRunning = false;
            scrapingStatus.phase = 'error';
        });

        res.json({ message: 'Scraping started' });
    });

    app.post('/api/scraper/stop', (req, res) => {
        scrapingStatus.isRunning = false;
        res.json({ message: 'Scraping stopped' });
    });

    app.get('/api/scraper/download', verifyTokenFromQuery, (req, res) => {
        if (scrapingStatus.movies.length === 0 && scraper.getFailedMovies().length === 0) {
            return res.status(400).json({ error: 'No data to download' });
        }

        const filename = `movies_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = scraper.exportToExcel(filename);

        if (filepath) {
            res.download(filepath, filename);
        } else {
            res.status(500).json({ error: 'Failed to create Excel file' });
        }
    });

    // New endpoint to get failed movies
    app.get('/api/scraper/failed-movies', (req, res) => {
        res.json(scraper.getFailedMovies());
    });

    app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

    console.log('🎬 Movie scraper routes configured');
}