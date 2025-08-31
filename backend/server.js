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
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { setupScraperRoutes } from './scrapper.js';
import multer from 'multer';
import XLSX from 'xlsx';

// Initialize environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 4000;

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