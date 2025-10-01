import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { main, enrichMoviesByIds } from './enrichMovies.js';
import { importAndEnrichSeries } from './enrichSeries.js';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { setupScraperRoutes } from './scrapper.js';
import multer from 'multer';
import XLSX from 'xlsx';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { mkdirSync, existsSync } from 'fs';

// Initialize environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 4000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security middleware
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
});

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    
    req.user = user;
    next();
  });
};

// Login endpoint with rate limiting
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email }); // Log without password
    
    // Get admin user from database
    const { data: user, error } = await supabase
      .from('Admins')
      .select('admin_id, email, password_hash')
      .eq('email', email.toLowerCase())
      .single();
    
    console.log('Database result:', { found: !!user, error: error?.message });
    
    if (error || !user) {
      console.log('User not found in database');
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('Password match:', passwordMatch);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user.admin_id,
        email: user.email,
        
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Return token
    res.status(200).json({
      token,
      user: {
        id: user.admin_id,
        email: user.email,
        name: user.name,
        
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Protected route example
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('Admins')
      .select('admin_id, email, name, role')
      .eq('admin_id', req.user.id)
      .single();
      
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Dashboard stats endpoint
app.get('/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    // Get movie count
    const { count: movieCount, error: movieError } = await supabase
      .from('Movies')
      .select('*', { count: 'exact', head: true });
    
    if (movieError) throw movieError;
    
    // Get genre count
    const { count: genreCount, error: genreError } = await supabase
      .from('Genre')
      .select('*', { count: 'exact', head: true });
    
    if (genreError) throw genreError;
    
    // Get category count
    const { count: categoryCount, error: categoryError } = await supabase
      .from('Category')
      .select('*', { count: 'exact', head: true });
    
    if (categoryError) throw categoryError;
    
    // Get series count
    const { count: seriesCount, error: seriesError } = await supabase
      .from('Movies')
      .select('*', { count: 'exact', head: true })
      .eq('type_id', 2);
    
    if (seriesError) throw seriesError;
    
    // Calculate storage usage (mock for now)
    const storageUsed = 325; // Mock value
    const storageLimit = 500; // Supabase free tier
    const storagePercentage = Math.round((storageUsed / storageLimit) * 100);
    
    // Get downloads
    const { data: downloadData, error: downloadError } = await supabase
      .from('Movies')
      .select('download_count')
      .not('download_count', 'is', null);
    
    if (downloadError) throw downloadError;
    
    const totalDownloads = downloadData.reduce((sum, movie) => sum + (movie.download_count || 0), 0);
    
    // Get recent uploads (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: recentCount, error: recentError } = await supabase
      .from('Movies')
      .select('*', { count: 'exact', head: true })
      .gte('release_date', thirtyDaysAgo.toISOString());
    
    if (recentError) throw recentError;
    
    res.json({
      movies: movieCount || 0,
      genres: genreCount || 0,
      series: seriesCount || 0,
      categories: categoryCount || 0,
      totalDownloads,
      recentUploads: recentCount || 0,
      storageUsage: storagePercentage,
      storageLimit,
      storageUsed
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
});

// Top movies endpoint
app.get('/dashboard/top-movies', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Movies')
      .select('movie_id, movie_title, download_count, rating')
      .order('download_count', { ascending: false })
      .limit(5);
    
    if (error) throw error;
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching top movies:', err);
    res.status(500).json({ message: 'Failed to fetch top movies' });
  }
});

// Category distribution endpoint
app.get('/dashboard/category-distribution', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Category')
      .select(`
        category_id,
        category_name,
        Movies(count)
      `);
    
    if (error) throw error;
    
    const processedCategories = data.map(category => ({
      name: category.category_name,
      count: category.Movies.length,
    })).sort((a, b) => b.count - a.count);
    
    res.json(processedCategories);
  } catch (err) {
    console.error('Error fetching category distribution:', err);
    res.status(500).json({ message: 'Failed to fetch category distribution' });
  }
});

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Store active connections
const clients = new Map();

// Handle upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = parse(request.url).pathname;
  
  if (pathname === '/progress') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle WebSocket connections
wss.on('connection', (ws, request) => {
  const id = Math.random().toString(36).substring(2, 15);
  clients.set(id, ws);
  
  console.log(`WebSocket client connected: ${id}`);
  
  ws.on('close', () => {
    clients.delete(id);
    console.log(`WebSocket client disconnected: ${id}`);
  });
});

// Helper function to broadcast progress updates
const broadcastProgress = (type, progress, options = {}) => {
  const message = JSON.stringify({
    type,
    progress,
    ...options
  });
  
  clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
};

const upload = multer({ dest: 'uploads/' });
// Update your movie import endpoint
app.post('/movies/import', authenticateToken, upload.single('movieFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    console.log(`File uploaded: ${req.file.originalname}`);
    const trackProgress = req.body.trackProgress === 'true';
    
    // Send initial progress
    if (trackProgress) {
      broadcastProgress('upload_progress', 0);
    }
    
    // Process the uploaded Excel file
    const processResult = await processExcelFile(req.file.path);
    console.log(`Processing result:`, processResult);
    
    // Send final progress
    if (trackProgress) {
      broadcastProgress('upload_progress', 100, { status: 'success' });
    }
    
    // Format the response correctly for the frontend
    const response = {
      success: true,
      message: `Successfully imported ${processResult.added} movies. ${processResult.duplicates} duplicates found.`,
      addedMovies: processResult.movies.map(movie => ({
        movie_id: movie.movie_id, // This is the key the frontend expects
        title: movie.movie_title
      })),
      errors: processResult.errors,
      duplicates: processResult.duplicates,
      total: processResult.total
    };
    
    console.log('Sending response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('Import error:', error);
    
    // Send error progress
    if (req.body.trackProgress === 'true') {
      broadcastProgress('upload_progress', 0, { 
        status: 'error',
        message: 'Import failed: ' + error.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Import failed', 
      error: error.message 
    });
  }
});

// Update the enrichment endpoint
app.post('/movies/enrich', authenticateToken, async (req, res) => {
    const { movieIds, trackProgress } = req.body;
    
    if (!Array.isArray(movieIds) || movieIds.length === 0) {
        return res.status(400).json({ message: 'No movie IDs provided' });
    }
    
    try {
        // Send initial progress
        if (trackProgress) {
            broadcastProgress('enrich_progress', 0);
        }
        
        console.log(`Starting enrichment for ${movieIds.length} movies`);
        
        // Call the correct function
        const enrichmentResult = await enrichMoviesByIds(movieIds);
        
        // Update progress as complete
        if (trackProgress) {
            broadcastProgress('enrich_progress', 100, { 
                status: enrichmentResult.failed === 0 ? 'success' : 'partial',
                notifyUser: true,
                title: 'Enrichment Complete',
                message: `Successfully enriched ${enrichmentResult.success} movies, ${enrichmentResult.partial} partial, ${enrichmentResult.failed} failed.`
            });
        }
        
        res.json(enrichmentResult);
    } catch (error) {
        console.error('Enrichment error:', error);
        
        // Send error progress
        if (trackProgress) {
            broadcastProgress('enrich_progress', 0, { 
                status: 'error',
                notifyUser: true,
                title: 'Enrichment Failed',
                message: 'Process failed: ' + error.message 
            });
        }
        
        res.status(500).json({ message: 'Enrichment failed', error: error.message });
    }
});

// In your main server.js file
setupScraperRoutes(app);

// Make sure to use the HTTP server instead of express app
server.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});

// Add this function to your server.js file
async function processExcelFile(filePath) {
  try {
    console.log(`Processing Excel file: ${filePath}`);
    
    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`Found ${data.length} movies in Excel file`);
    
    if (data.length === 0) {
      return { total: 0, added: 0, duplicates: 0, errors: ['Excel file has no valid data rows'], movies: [] };
    }
    
    console.log('Sample data from Excel:', data.slice(0, 2));
    
    // Process each movie
    const results = {
      total: data.length,
      added: 0,
      duplicates: 0,
      errors: [],
      movies: []
    };
    
    for (const movie of data) {
      try {
        // Only require movie_title
        if (!movie.movie_title || movie.movie_title.trim() === '') {
          results.errors.push(`Row missing required movie_title field`);
          continue;
        }
        
        const cleanTitle = movie.movie_title.trim();
        console.log(`Processing movie: ${cleanTitle}`);
        
        // Check if movie already exists
        const { data: existing, error: checkError } = await supabase
          .from('Movies')
          .select('movie_id')
          .ilike('movie_title', cleanTitle)
          .maybeSingle();
          
        if (checkError) {
          console.error(`Database error checking for existing movie:`, checkError);
          throw checkError;
        }
        
        if (existing) {
          console.log(`Movie "${cleanTitle}" already exists in database`);
          results.duplicates++;
          continue;
        }
        
        // Prepare movie object - be more careful with data types
        const movieData = {
          movie_title: cleanTitle,
          type_id: movie.type_id || 1, // Default to movie type
          download_count: movie.download_count || 0
        };
        
        // Only include fields that have actual values
        if (movie.category_id && !isNaN(movie.category_id)) {
          movieData.category_id = parseInt(movie.category_id);
        }
        if (movie.release_year && !isNaN(movie.release_year)) {
          movieData.release_year = parseInt(movie.release_year);
        }
        if (movie.download_url && movie.download_url.trim()) {
          movieData.download_url = movie.download_url.trim();
        }
        if (movie.file_path && movie.file_path.trim()) {
          movieData.file_path = movie.file_path.trim();
        }
        if (movie.file_size_bytes && !isNaN(movie.file_size_bytes)) {
          movieData.file_size_bytes = parseInt(movie.file_size_bytes);
        }
        if (movie.plot && movie.plot.trim()) {
          movieData.plot = movie.plot.trim();
        }
        if (movie.duration && !isNaN(movie.duration)) {
          movieData.duration = parseInt(movie.duration);
        }
        if (movie.rating && !isNaN(movie.rating)) {
          movieData.rating = parseFloat(movie.rating);
        }
        if (movie.image_url && movie.image_url.trim()) {
          movieData.image_url = movie.image_url.trim();
        }
        if (movie.release_date && movie.release_date.trim()) {
          movieData.release_date = movie.release_date.trim();
        }
        
        console.log('Inserting movie data:', movieData);
        
        // Add the movie to the database
        const { data: newMovie, error: insertError } = await supabase
          .from('Movies')
          .insert(movieData)
          .select('movie_id, movie_title')
          .single();
          
        if (insertError) {
          console.error(`Error inserting movie "${cleanTitle}":`, insertError);
          throw insertError;
        }
        
        console.log(`✓ Added movie: ${newMovie.movie_title} (ID: ${newMovie.movie_id})`);
        results.added++;
        results.movies.push(newMovie);
        
      } catch (err) {
        console.error(`Error processing movie "${movie.movie_title || 'unknown'}":`, err);
        results.errors.push(`Error processing movie "${movie.movie_title || 'unknown'}": ${err.message}`);
      }
    }
    
    console.log(`Excel import completed: ${results.added} added, ${results.duplicates} duplicates, ${results.errors.length} errors`);
    return results;
  } catch (error) {
    console.error('Excel processing error:', error);
    throw new Error(`Failed to process Excel file: ${error.message}`);
  }
}

// File upload route
app.post('/upload-excel', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`File uploaded to: ${filePath}`);

        // Here you can add code to process the uploaded Excel file
        // For example, read the file and import data to your database

        res.status(200).json({ message: 'File uploaded successfully', filePath });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Series import endpoint
app.post('/api/series/import', authenticateToken, upload.single('seriesFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    console.log(`Series file uploaded: ${req.file.originalname}`);
    const trackProgress = req.body.trackProgress === 'true';
    
    // Send initial progress
    if (trackProgress) {
      broadcastProgress('upload_progress', 0, { contentType: 'series' });
    }
    
    // Process the uploaded Excel file with series data
    const result = await importAndEnrichSeries(req.file.path);
    
    // Extract the series IDs from the database
    const { data: seriesArray, error: fetchError } = await supabase
      .from('Serie')
      .select('serie_id, serie_title')
      .order('serie_title', { ascending: true })
      .limit(100);  // Limit to reasonable number
      
    if (fetchError) {
      throw new Error(`Failed to fetch series: ${fetchError.message}`);
    }
    
    // Send final progress
    if (trackProgress) {
      broadcastProgress('upload_progress', 100, { 
        status: 'success', 
        contentType: 'series' 
      });
    }
    
    // Return a response structure that matches what the frontend expects
    res.json({
      success: true,
      message: `Successfully processed ${result.series} series with ${result.seasons} seasons and ${result.episodes} episodes.`,
      addedSeries: seriesArray || [], // This is what the frontend expects
      series: result.series,
      seasons: result.seasons,
      episodes: result.episodes
    });
    
  } catch (error) {
    console.error('Series import error:', error);
    
    // Send error progress
    if (req.body.trackProgress === 'true') {
      broadcastProgress('upload_progress', 0, { 
        status: 'error',
        contentType: 'series',
        message: 'Series import failed: ' + error.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Series import failed', 
      error: error.message,
      addedSeries: [] // Include empty array for error cases
    });
  }
});



// Series bulk enrichment endpoint (for processing series that were imported separately)
app.post('/api/series/enrich', authenticateToken, async (req, res) => {
  const { seriesIds, trackProgress } = req.body;
  
  if (!Array.isArray(seriesIds) || seriesIds.length === 0) {
    return res.status(400).json({ message: 'No series IDs provided' });
  }
  
  try {
    // Send initial progress
    if (trackProgress) {
      broadcastProgress('enrich_progress', 0, { contentType: 'series' });
    }
    
    console.log(`Starting enrichment for ${seriesIds.length} series`);
    
    // Fetch series data
    const { data: seriesList, error: fetchError } = await supabase
      .from('Serie')
      .select('serie_id, serie_title, release_year')
      .in('serie_id', seriesIds);
      
    if (fetchError) {
      throw new Error(`Failed to fetch series: ${fetchError.message}`);
    }
    
    const totalSeries = seriesList.length;
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const results = [];
    
    // Process each series
    for (const series of seriesList) {
      try {
        // Send progress update
        if (trackProgress) {
          const progress = Math.round((processedCount / totalSeries) * 100);
          broadcastProgress('enrich_progress', progress, {
            contentType: 'series',
            currentItem: series.serie_title
          });
        }
        
        // Create a temporary Excel file with just this series
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
          fs
        }
        
        const tempFilePath = path.join(tempDir, `series_${series.serie_id}_${Date.now()}.xlsx`);
        
        // Create a workbook with the series data
        const wb = XLSX.utils.book_new();
        const seriesSheet = XLSX.utils.json_to_sheet([{
          serie_id: series.serie_id,
          serie_title: series.serie_title,
          release_year: series.release_year
        }]);
        XLSX.utils.book_append_sheet(wb, seriesSheet, 'Serie');
        XLSX.writeFile(wb, tempFilePath);
        
        // Enrich this series
        await importAndEnrichSeries(tempFilePath);
        
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn(`Failed to clean up temp file: ${cleanupError.message}`);
        }
        
        results.push({
          serie_id: series.serie_id,
          serie_title: series.serie_title,
          status: 'success'
        });
        
        successCount++;
      } catch (err) {
        console.error(`Error enriching series ${series.serie_title}:`, err);
        failedCount++;
        results.push({
          serie_id: series.serie_id,
          serie_title: series.serie_title,
          status: 'failed',
          error: err.message
        });
      }
      
      processedCount++;
    }
    
    // Send completion progress
    if (trackProgress) {
      broadcastProgress('enrich_progress', 100, { 
        status: failedCount === 0 ? 'success' : 'partial',
        contentType: 'series',
        notifyUser: true,
        title: 'Series Enrichment Complete',
        message: `Successfully enriched ${successCount} series, ${failedCount} failed.`
      });
    }
    
    res.json({
      success: successCount,
      failed: failedCount,
      total: totalSeries,
      results
    });
    
  } catch (error) {
    console.error('Series enrichment error:', error);
    
    // Send error progress
    if (trackProgress) {
      broadcastProgress('enrich_progress', 0, { 
        status: 'error',
        contentType: 'series',
        notifyUser: true,
        title: 'Series Enrichment Failed',
        message: 'Process failed: ' + error.message 
      });
    }
    
    res.status(500).json({ message: 'Series enrichment failed', error: error.message });
  }
});

// Find movies with missing important data
app.get('/api/movies/missing-data', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Movies')
      .select('movie_id, movie_title, release_year, image_url, plot, release_date, rating, duration, trailer, tmdb_id')
      .or('image_url.is.null,plot.is.null,tmdb_id.is.null,trailer.is.null,rating.is.null')
      .order('movie_title');
      
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching movies with missing data:', err);
    res.status(500).json({ message: 'Failed to fetch movies', error: err.message });
  }
});

// Find series with missing important data
app.get('/api/series/missing-data', authenticateToken, async (req, res) => {
  try {
    // Get series with missing metadata
    const { data, error } = await supabase
      .from('Serie')
      .select('serie_id, serie_title, release_year, image_url, description, rating, trailer, tmdb_id')
      .or('image_url.is.null,description.is.null,tmdb_id.is.null,trailer.is.null')
      .order('serie_title');
      
    if (error) throw error;
    
    // For each series, also check if it's missing seasons or episodes
    for (const series of data) {
      series.missing = [];
      
      // Check if series has seasons
      const { count: seasonCount } = await supabase
        .from('Season')
        .select('*', { count: 'exact', head: true })
        .eq('serie_id', series.serie_id);
      
      if (seasonCount === 0) {
        series.missing.push('seasons');
      } else {
        // Check if seasons have episodes
        const { count: episodeCount } = await supabase
          .from('Episodes')
          .select('*', { count: 'exact', head: true })
          .eq('serie_id', series.serie_id);
        
        if (episodeCount === 0) {
          series.missing.push('episodes');
        }
      }
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching series with missing data:', err);
    res.status(500).json({ message: 'Failed to fetch series', error: err.message });
  }
});

async function enrichSeriesById(seriesIds, trackProgress = false) {
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, 'temp');
  if (!existsSync(tempDir)) {
    try {
      console.log(`Creating temp directory at: ${tempDir}`);
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create temp directory: ${error.message}`);
      throw new Error(`Unable to create temp directory: ${error.message}`);
    }
  }
  
  // Rest of your function...
}

// Delete a series and all its associated data
app.delete('/api/series/:id', authenticateToken, async (req, res) => {
  const serieId = req.params.id;
  
  try {
    console.log(`Deleting series ID ${serieId} and all related data`);
    
    // 1. Delete all episodes associated with this series
    const { error: episodesError } = await supabase
      .from('Episodes')
      .delete()
      .eq('serie_id', serieId);
    
    if (episodesError) throw episodesError;
    
    // 2. Delete all seasons associated with this series
    const { error: seasonsError } = await supabase
      .from('Season')
      .delete()
      .eq('serie_id', serieId);
    
    if (seasonsError) throw seasonsError;
    
    // 3. Delete genre relationships
    const { error: genresError } = await supabase
      .from('SeriesGenres')
      .delete()
      .eq('serie_id', serieId);
    
    if (genresError) throw genresError;
    
    // 4. Finally delete the series itself
    const { error: serieError } = await supabase
      .from('Serie')
      .delete()
      .eq('serie_id', serieId);
    
    if (serieError) throw serieError;
    
    res.json({ 
      success: true, 
      message: `Series ID ${serieId} and all related data successfully deleted` 
    });
  } catch (err) {
    console.error(`Error deleting series ${serieId}:`, err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete series', 
      error: err.message 
    });
  }
});

// Delete specific episodes
app.delete('/api/episodes', authenticateToken, async (req, res) => {
  const { episodeIds } = req.body;
  
  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return res.status(400).json({ message: 'No episode IDs provided' });
  }
  
  try {
    console.log(`Deleting ${episodeIds.length} episodes`);
    
    // Delete the specified episodes
    const { error } = await supabase
      .from('Episodes')
      .delete()
      .in('episode_id', episodeIds);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: `Successfully deleted ${episodeIds.length} episodes` 
    });
  } catch (err) {
    console.error('Error deleting episodes:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete episodes', 
      error: err.message 
    });
  }
});

// Get all series
app.get('/api/series', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching all series for Series Manager');
    const { data, error } = await supabase
      .from('Serie')
      .select('*')
      .order('serie_title');
      
    if (error) {
      console.error('Error fetching series:', error);
      throw error;
    }
    
    console.log(`Returning ${data?.length || 0} series`);
    res.json(data || []);
  } catch (err) {
    console.error('Error in GET /api/series endpoint:', err);
    res.status(500).json({ message: 'Failed to fetch series', error: err.message });
  }
});

// Get series details with seasons and episodes for management
app.get('/api/series/:id/details', authenticateToken, async (req, res) => {
  try {
    const serieId = req.params.id;
    
    // Get series data
    const { data: serie, error: serieError } = await supabase
      .from('Serie')
      .select('*')
      .eq('serie_id', serieId)
      .single();
      
    if (serieError) throw serieError;
    
    // Get seasons for this series
    const { data: seasons, error: seasonsError } = await supabase
      .from('Season')
      .select('*')
      .eq('serie_id', serieId)
      .order('season_number');
      
    if (seasonsError) throw seasonsError;
    
    // Get episodes for this series
    const { data: episodes, error: episodesError } = await supabase
      .from('Episodes')
      .select('*')
      .eq('serie_id', serieId)
      .order('season_id, episode_number');
      
    if (episodesError) throw episodesError;
    
    // Organize episodes by season
    const seasonMap = {};
    seasons.forEach(season => {
      seasonMap[season.season_id] = {
        ...season,
        episodes: []
      };
    });
    
    episodes.forEach(episode => {
      if (seasonMap[episode.season_id]) {
        seasonMap[episode.season_id].episodes.push(episode);
      }
    });
    
    res.json({
      serie,
      seasons: Object.values(seasonMap)
    });
  } catch (err) {
    console.error('Error fetching series details:', err);
    res.status(500).json({ message: 'Failed to fetch series details', error: err.message });
  }
});