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
    currentCategory: '',
    currentMovie: '',
    movies: [],
    errors: []
};

class MovieScraper {
    constructor(baseUrl = 'http://103.145.232.246/Data/movies/Hollywood/') {
        this.baseUrl = baseUrl;
        this.movies = [];
        this.delay = 1000;
        this.pendingLinks = [];
        this.processedUrls = new Set();
        this.videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'm4v', 'webm', 'mpg', 'mpeg'];
    }

    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async fetchPage(url) {
        try {
            // Don't process the same URL twice
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
            scrapingStatus.errors.push(`Failed to fetch: ${url} - ${error.message}`);
            return null;
        }
    }

    isVideoFile(url) {
        const extension = url.split('.').pop().toLowerCase();
        return this.videoExtensions.includes(extension);
    }

    // Extract folder name from URL to use as category
    getFolderName(url) {
        // Remove trailing slash
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        // Get the last part of the URL
        const parts = cleanUrl.split('/');
        return parts[parts.length - 1] || 'Unknown';
    }

    // Update the parseMovieInfo method to handle both URL encoding and different naming patterns
    parseMovieInfo(filename, folderPath) {
        // First, URL decode the filename and folder path
        const decodedFilename = decodeURIComponent(filename);
        const decodedFolderPath = decodeURIComponent(folderPath);
        
        // 1. Try to extract from the folder name first (Example 1)
        // Look for patterns like "Movie Name (2023)"
        const folderNameMatch = decodedFolderPath.match(/\/([^\/]+)\s*\((\d{4})\)\/[^\/]*$/);
        if (folderNameMatch) {
            return {
                title: folderNameMatch[1].trim().replace(/\./g, ' '),
                year: folderNameMatch[2]
            };
        }
        
        // 2. Try to extract year from folder with dot separators (Example 2)
        // Pattern like "Movie.Name.2023.1080p..."
        const dotYearMatch = decodedFolderPath.match(/\/([^\/]+)\.(\d{4})\.[^\/]*$/);
        if (dotYearMatch) {
            return {
                title: dotYearMatch[1].replace(/\./g, ' ').trim(),
                year: dotYearMatch[2]
            };
        }
        
        // 3. Try to extract from filename if folder didn't work
        // Remove file extension first
        const nameWithoutExt = decodedFilename.replace(/\.[^/.]+$/, "");
        
        // Check for "Movie Name (Year)" pattern
        const filenameYearMatch = nameWithoutExt.match(/(.+)\s*\((\d{4})\)$/);
        if (filenameYearMatch) {
            return {
                title: filenameYearMatch[1].trim().replace(/\./g, ' '),
                year: filenameYearMatch[2]
            };
        }
        
        // Check for "Movie.Name.Year" pattern
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
            // Get the path after the last slash but before the file
            const pathParts = decodedFolderPath.split('/');
            const folderName = pathParts[pathParts.length - 2] || '';
            
            return {
                title: folderName.replace(/\.\d{4}\..+$/g, '').replace(/\./g, ' ').trim(),
                year: yearDigits[1]
            };
        }
        
        // If no patterns match, use the filename without extension as title
        return {
            title: nameWithoutExt.replace(/\./g, ' ').trim(),
            year: ''
        };
    }

    // Update the crawlDirectory method to handle the file structure correctly
    async crawlDirectory(url, currentDepth = 0, maxDepth = 10) {
        // Safety check - don't go too deep
        if (currentDepth > maxDepth || !scrapingStatus.isRunning) {
            return;
        }
        
        // Update current folder being processed
        const folderName = this.getFolderName(url);
        scrapingStatus.currentCategory = folderName;
        
        console.log(`Crawling directory: ${url}`);
        
        const html = await this.fetchPage(url);
        if (!html) return;
        
        const $ = cheerio.load(html);
        const links = [];
        
        // Find all links
        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (!href) return;
            
            const fullUrl = new URL(href, url).toString();
            
            // Skip parent directory links
            if (href === '../' || href === '..') return;
            
            // Check if it's a directory or a file
            if (href.endsWith('/')) {
                links.push({ url: fullUrl, isDirectory: true });
            } else {
                links.push({ url: fullUrl, isDirectory: false });
            }
        });
        
        // First process all directories
        for (const link of links) {
            if (link.isDirectory && scrapingStatus.isRunning) {
                await this.crawlDirectory(link.url, currentDepth + 1, maxDepth);
                await this.sleep(this.delay);
            }
        }
        
        // Then process all files
        for (const link of links) {
            if (!link.isDirectory && this.isVideoFile(link.url) && scrapingStatus.isRunning) {
                const filename = link.url.split('/').pop();
                // Pass both filename and full path to parseMovieInfo
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
                    type_id: '1', // Default to Movie type
                    category_id: '', // Leave empty as requested
                    download_count: '0'
                };
                
                this.movies.push(movieData);
                scrapingStatus.movies.push(movieData);
                
                // Update progress
                scrapingStatus.progress = Math.min(
                    95, // Cap at 95% until fully complete
                    Math.round((scrapingStatus.movies.length / (scrapingStatus.totalMovies || 1)) * 100)
                );
                
                await this.sleep(this.delay);
            }
        }
    }

    async scrapeMovies(options = {}) {
        const { baseUrl, delay } = options;
        
        // Reset status
        scrapingStatus.isRunning = true;
        scrapingStatus.progress = 0;
        scrapingStatus.movies = [];
        scrapingStatus.errors = [];
        scrapingStatus.totalMovies = 100; // Initial guess, will be updated as we discover files
        
        // Reset scraper
        this.movies = [];
        this.processedUrls = new Set();
        this.baseUrl = baseUrl || this.baseUrl;
        
        if (delay) {
            this.delay = delay;
        }

        try {
            // Start crawling from the base URL
            await this.crawlDirectory(this.baseUrl);
            
            // Final progress update
            scrapingStatus.progress = 100;
            scrapingStatus.totalMovies = this.movies.length;
            
            return this.movies;
        } catch (error) {
            scrapingStatus.errors.push(`Scraping error: ${error.message}`);
            console.error("Scraping failed:", error);
        } finally {
            scrapingStatus.isRunning = false;
            scrapingStatus.currentCategory = '';
            scrapingStatus.currentMovie = '';
        }

        return this.movies;
    }

    exportToExcel(filename) {
        if (this.movies.length === 0) return null;

        // Create downloads directory if it doesn't exist
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!existsSync(downloadsDir)) {
            mkdirSync(downloadsDir);
        }

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(this.movies);
        xlsx.utils.book_append_sheet(wb, ws, 'Movies');
        
        const filepath = path.join(downloadsDir, filename);
        xlsx.writeFile(wb, filepath);
        
        return filepath;
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
    // Add CORS middleware for the scraper routes
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
        
        // Validate the base URL
        if (options.baseUrl) {
            try {
                new URL(options.baseUrl); // This will throw if URL is invalid
            } catch (error) {
                return res.status(400).json({ error: 'Invalid URL format' });
            }
            
            // Make sure URL ends with a slash
            if (!options.baseUrl.endsWith('/')) {
                options.baseUrl += '/';
            }
        }
        
        // Start scraping in background
        scraper.scrapeMovies(options).catch(error => {
            console.error('Scraping failed:', error);
            scrapingStatus.errors.push(`Scraping failed: ${error.message}`);
            scrapingStatus.isRunning = false;
        });
        
        res.json({ message: 'Scraping started' });
    });

    app.post('/api/scraper/stop', (req, res) => {
        scrapingStatus.isRunning = false;
        res.json({ message: 'Scraping stopped' });
    });

    app.get('/api/scraper/download', verifyTokenFromQuery, (req, res) => {
        if (scrapingStatus.movies.length === 0) {
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

    // Serve static files from downloads directory
    app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

    console.log('🎬 Movie scraper routes configured');
}