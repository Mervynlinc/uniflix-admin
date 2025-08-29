import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// TMDB API key
const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function main(filePath) {
    try {
        console.log('Starting enrichment process...');

        // Check if TMDB API key is set
        if (!TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY is not set in environment variables');
        }

        // Read Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Assume first sheet
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        console.log(`Found ${jsonData.length} rows in Excel file`);

        // Process each row
        for (const row of jsonData) {
            try {
                // Map Excel columns to database fields
                const movieData = {
                    movie_title: row.movie_title,
                    release_year: row.release_year,
                    download_url: row.download_url,
                    type_id: row.type_id,
                    category_id: row.category_id,
                    download_count: row.download_count || 0,
                    // These will be enriched from TMDB
                    release_date: null,
                    plot: null,
                    duration: null,
                    rating: null,
                    image_url: null,
                    trailer: null,
                    imdb_id: null
                };

                // Insert into Supabase (fix table name)
                const { data, error } = await supabase
                    .from('Movies') // Changed from 'movies' to 'Movies'
                    .insert([movieData])
                    .select();

                if (error) {
                    console.error('Error inserting movie:', error);
                    continue;
                }

                const movieId = data[0].movie_id; // Changed from 'id' to 'movie_id'
                console.log(`Inserted movie: ${movieData.movie_title}`);

                // Enrich with TMDB
                await enrichMovie(movieId, movieData.movie_title, movieData.release_year);

            } catch (err) {
                console.error(`Error processing row: ${err.message}`);
            }
        }

        console.log('Enrichment process completed');
    } catch (err) {
        console.error('Main process error:', err);
    }
}

async function enrichMovie(movieId, title, year) {
    try {
        console.log(`Enriching movie: ${title} (${year}) with ID: ${movieId}`);
        
        // Search TMDB for the movie
        const searchResponse = await axios.get('https://api.themoviedb.org/3/search/movie', {
            params: {
                api_key: TMDB_API_KEY,
                query: title,
                year: year
            }
        });

        const results = searchResponse.data.results;
        console.log(`TMDB search results for "${title}": ${results.length} matches`);
        
        if (results.length === 0) {
            console.log(`No TMDB match for ${title}`);
            return;
        }

        const movie = results[0];
        const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;
        
        // Get detailed movie information (including runtime and genres)
        let runtime = null;
        let genres = [];
        try {
            const detailsResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}`, {
                params: {
                    api_key: TMDB_API_KEY
                }
            });
            runtime = detailsResponse.data.runtime; // Runtime in minutes
            genres = detailsResponse.data.genres.map(g => g.name); // <-- Extract genre names
            console.log(`Fetched runtime for ${title}: ${runtime} minutes`);
            console.log(`Fetched genres for ${title}: ${genres.join(', ')}`);
        } catch (err) {
            console.error(`Error fetching movie details for ${title}:`, err.message);
        }
        
        // Get movie videos (including trailers)
        let trailerUrl = null;
        try {
            const videosResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}/videos`, {
                params: {
                    api_key: TMDB_API_KEY
                }
            });
            const videos = videosResponse.data.results;
            const trailer = videos.find(video => video.type === 'Trailer' && video.site === 'YouTube');
            if (trailer) {
                trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
                console.log(`Fetched trailer for ${title}: ${trailerUrl}`);
            }
        } catch (err) {
            console.error(`Error fetching videos for ${title}:`, err.message);
        }
        
        console.log(`Updating movie ${movieId} with TMDB data:`, {
            tmdb_id: movie.id,
            image_url: posterUrl,
            plot: movie.overview,
            release_date: movie.release_date,
            rating: movie.vote_average,
            duration: runtime,
            trailer: trailerUrl,
            imdb_id: movie.imdb_id
        });

        // Update movie with TMDB data (no genres here)
        const { data, error } = await supabase
            .from('Movies')
            .update({
                tmdb_id: movie.id,
                image_url: posterUrl,
                plot: movie.overview,
                release_date: movie.release_date,
                rating: movie.vote_average,
                duration: runtime,
                trailer: trailerUrl,
                imdb_id: movie.imdb_id
            })
            .eq('movie_id', movieId)
            .select();

        if (error) {
            console.error('Error updating movie:', error);
        } else {
            console.log(`Successfully updated movie ${movieId}:`, data);
        }

        // --- Enrich genres in normalized tables ---
        for (const genreName of genres) {
            // 1. Ensure genre exists in Genre table
            let genreId;
            const { data: genreData, error: genreError } = await supabase
                .from('Genre') // <-- Correct table name
                .select('genre_id')
                .eq('genre', genreName) // <-- Correct column name
                .single();

            if (genreData) {
                genreId = genreData.genre_id;
            } else {
                // Insert new genre
                const { data: newGenre, error: insertError } = await supabase
                    .from('Genre') // <-- Correct table name
                    .insert([{ genre: genreName }]) // <-- Correct column name
                    .select()
                    .single();
                genreId = newGenre?.genre_id;
            }

            if (genreId) {
                // 2. Insert into MovieGenres join table
                await supabase
                    .from('MovieGenres')
                    .insert([{ movie_id: movieId, genre_id: genreId }]);
            }
        }
    } catch (err) {
        console.error(`TMDB enrichment error for ${title}:`, err.message);
    }
}

// New function to enrich movies by IDs
async function enrichMoviesByIds(movieIds) {
    const results = {
        success: 0,
        failed: 0,
        partial: 0,
        details: []
    };

    for (const movieId of movieIds) {
        try {
            // Fetch movie details from database
            const { data: movie, error: fetchError } = await supabase
                .from('Movies')
                .select('movie_id, movie_title, release_year')
                .eq('movie_id', movieId) // This is already correct
                .single();

            if (fetchError || !movie) {
                results.failed++;
                results.details.push({
                    movie_id: movieId,
                    movie_title: 'Unknown',
                    status: 'failed',
                    error: 'Movie not found in database'
                });
                continue;
            }

            // Enrich with TMDB (calls enrichMovie, which is now fixed)
            await enrichMovie(movie.movie_id, movie.movie_title, movie.release_year);

            results.success++;
            results.details.push({
                movie_id: movie.movie_id,
                movie_title: movie.movie_title,
                status: 'success'
            });

        } catch (err) {
            console.error(`Error enriching movie ID ${movieId}:`, err);
            results.failed++;
            results.details.push({
                movie_id: movieId,
                movie_title: 'Unknown',
                status: 'failed',
                error: err.message
            });
        }
    }

    return results;
}

// Export both functions
export { main, enrichMoviesByIds };