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

// Main function to process Excel file with series data
async function importAndEnrichSeries(filePath) {
    try {
        console.log('Starting series enrichment process...');

        // Check if TMDB API key is set
        if (!TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY is not set in environment variables');
        }

        // Read Excel file
        const workbook = xlsx.readFile(filePath);
        
        // Get all sheets
        const serieSheet = workbook.Sheets['Serie'];
        const seasonSheet = workbook.Sheets['Season'];
        const episodesSheet = workbook.Sheets['Episodes'];

        // Convert sheets to JSON
        const seriesData = serieSheet ? xlsx.utils.sheet_to_json(serieSheet) : [];
        const seasonsData = seasonSheet ? xlsx.utils.sheet_to_json(seasonSheet) : [];
        const episodesData = episodesSheet ? xlsx.utils.sheet_to_json(episodesSheet) : [];

        console.log(`Found ${seriesData.length} series, ${seasonsData.length} seasons, and ${episodesData.length} episodes`);

        // Process series first to establish parent records
        const seriesMap = new Map(); // Map to store serie_title -> serie_id mapping
        for (const series of seriesData) {
            try {
                // First, enrich with TMDB data
                const enrichedSeriesData = await enrichSeriesWithTMDB(series);
                
                // Store genres separately - don't include in database insert
                const seriesGenres = enrichedSeriesData.genres || [];
                
                // Create a clean copy without genres field for database insertion
                const seriesForInsert = {
                    serie_title: enrichedSeriesData.serie_title,
                    description: enrichedSeriesData.description,
                    release_year: enrichedSeriesData.release_year,
                    total_seasons: enrichedSeriesData.total_seasons,
                    total_episodes: enrichedSeriesData.total_episodes,
                    rating: enrichedSeriesData.rating,
                    image_url: enrichedSeriesData.image_url,
                    trailer: enrichedSeriesData.trailer,
                    type_id: enrichedSeriesData.type_id,
                    tmdb_id: enrichedSeriesData.tmdb_id
                };
                
                // Check if series already exists
                const { data: existingSeries, error: checkError } = await supabase
                    .from('Serie')
                    .select('serie_id')
                    .eq('serie_title', series.serie_title)
                    .maybeSingle();

                let serieId;
                if (existingSeries) {
                    // Update existing series with the clean object
                    serieId = existingSeries.serie_id;
                    const { error: updateError } = await supabase
                        .from('Serie')
                        .update(seriesForInsert)
                        .eq('serie_id', serieId);

                    if (updateError) {
                        console.error(`Error updating series ${series.serie_title}:`, updateError);
                    } else {
                        console.log(`Updated series ${series.serie_title} with ID ${serieId}`);
                    }
                } else {
                    // Insert new series with the clean object
                    const { data: newSeries, error: insertError } = await supabase
                        .from('Serie')
                        .insert([seriesForInsert])
                        .select();

                    if (insertError) {
                        console.error(`Error inserting series ${series.serie_title}:`, insertError);
                        continue;
                    }
                    
                    serieId = newSeries[0].serie_id;
                    console.log(`Inserted series ${series.serie_title} with ID ${serieId}`);
                }
                
                // Store mapping for use with seasons and episodes
                seriesMap.set(series.serie_title, serieId);
                // FIXED: Store TMDB ID in the map for later use
                seriesMap.set(series.serie_title + '_tmdbId', enrichedSeriesData.tmdb_id);
                
                // Still use the genres from enriched data for the join table
                if (seriesGenres.length > 0) {
                    await addGenresToSeries(serieId, seriesGenres);
                }
                
            } catch (err) {
                console.error(`Error processing series ${series.serie_title}:`, err);
            }
        }

        // Process seasons next
        const seasonMap = new Map(); // Map to store serie_title+season_number -> season_id mapping
        for (const season of seasonsData) {
            try {
                const serieId = seriesMap.get(season.serie_title);
                const tmdbId = seriesMap.get(season.serie_title + '_tmdbId');
                
                if (!serieId) {
                    console.error(`Cannot find series ID for ${season.serie_title}, skipping season ${season.season_number}`);
                    continue;
                }
                
                // Enrich season with TMDB data - now passing the correct TMDB ID
                const enrichedSeasonData = await enrichSeasonWithTMDB(
                    season,
                    serieId,
                    tmdbId
                );
                
                // Check if season already exists
                const { data: existingSeason, error: checkError } = await supabase
                    .from('Season')
                    .select('season_id')
                    .eq('serie_id', serieId)
                    .eq('season_number', season.season_number)
                    .maybeSingle();
                
                let seasonId;
                if (existingSeason) {
                    // Update existing season
                    seasonId = existingSeason.season_id;
                    const { error: updateError } = await supabase
                        .from('Season')
                        .update({
                            season_title: enrichedSeasonData.season_title,
                            season_description: enrichedSeasonData.season_description,
                            episode_count: enrichedSeasonData.episode_count,
                            image_url: enrichedSeasonData.image_url,
                            trailer: enrichedSeasonData.trailer
                        })
                        .eq('season_id', seasonId);
                        
                    if (updateError) {
                        console.error(`Error updating season ${season.season_number} for ${season.serie_title}:`, updateError);
                    } else {
                        console.log(`Updated season ${season.season_number} for ${season.serie_title} with ID ${seasonId}`);
                    }
                } else {
                    // Insert new season
                    const { data: newSeason, error: insertError } = await supabase
                        .from('Season')
                        .insert([{
                            serie_id: serieId,
                            ...enrichedSeasonData
                        }])
                        .select();
                        
                    if (insertError) {
                        console.error(`Error inserting season ${season.season_number} for ${season.serie_title}:`, insertError);
                        continue;
                    }
                    
                    seasonId = newSeason[0].season_id;
                    console.log(`Inserted season ${season.season_number} for ${season.serie_title} with ID ${seasonId}`);
                }
                
                // Store mapping for use with episodes
                seasonMap.set(`${season.serie_title}_${season.season_number}`, seasonId);
                
            } catch (err) {
                console.error(`Error processing season ${season.season_number} for ${season.serie_title}:`, err);
            }
        }
        
        // Finally, process episodes
        for (const episode of episodesData) {
            try {
                const serieId = seriesMap.get(episode.serie_title);
                const seasonId = seasonMap.get(`${episode.serie_title}_${episode.season_number}`);
                const tmdbId = seriesMap.get(episode.serie_title + '_tmdbId');
                
                if (!serieId || !seasonId) {
                    console.error(`Cannot find series/season ID for ${episode.serie_title} S${episode.season_number}, skipping episode ${episode.episode_number}`);
                    continue;
                }
                
                // Enrich episode with TMDB data - now passing the correct TMDB ID
                const enrichedEpisodeData = await enrichEpisodeWithTMDB(
                    episode,
                    serieId,
                    seasonId,
                    tmdbId
                );
                
                // Check if episode already exists
                const { data: existingEpisode, error: checkError } = await supabase
                    .from('Episodes')
                    .select('episode_id')
                    .eq('serie_id', serieId)
                    .eq('season_id', seasonId)
                    .eq('episode_number', episode.episode_number)
                    .maybeSingle();
                    
                if (existingEpisode) {
                    // Update existing episode
                    const episodeId = existingEpisode.episode_id;
                    const { error: updateError } = await supabase
                        .from('Episodes')
                        .update({
                            episode_title: enrichedEpisodeData.episode_title,
                            episode_description: enrichedEpisodeData.episode_description,
                            duration: enrichedEpisodeData.duration,
                            release_date: enrichedEpisodeData.release_date,
                            download_url: episode.download_url,
                            rating: enrichedEpisodeData.rating,
                            image_url: enrichedEpisodeData.image_url,
                            tmdb_id: enrichedEpisodeData.tmdb_id
                        })
                        .eq('episode_id', episodeId);
                        
                    if (updateError) {
                        console.error(`Error updating episode ${episode.episode_number} for ${episode.serie_title} S${episode.season_number}:`, updateError);
                    } else {
                        console.log(`Updated episode ${episode.episode_number} for ${episode.serie_title} S${episode.season_number}`);
                    }
                } else {
                    // Insert new episode
                    const { data: newEpisode, error: insertError } = await supabase
                        .from('Episodes')
                        .insert([{
                            serie_id: serieId,
                            season_id: seasonId,
                            episode_number: episode.episode_number,
                            episode_title: enrichedEpisodeData.episode_title,
                            episode_description: enrichedEpisodeData.episode_description,
                            duration: enrichedEpisodeData.duration,
                            release_date: enrichedEpisodeData.release_date,
                            download_url: episode.download_url,
                            rating: enrichedEpisodeData.rating,
                            image_url: enrichedEpisodeData.image_url,
                            tmdb_id: enrichedEpisodeData.tmdb_id,
                            download_count: 0
                        }])
                        .select();
                        
                    if (insertError) {
                        console.error(`Error inserting episode ${episode.episode_number} for ${episode.serie_title} S${episode.season_number}:`, insertError);
                    } else {
                        console.log(`Inserted episode ${episode.episode_number} for ${episode.serie_title} S${episode.season_number}`);
                    }
                }
                
            } catch (err) {
                console.error(`Error processing episode ${episode.episode_number} for ${episode.serie_title} S${episode.season_number}:`, err);
            }
        }
        
        console.log('Series enrichment process completed');
        return {
            series: seriesData.length,
            seasons: seasonsData.length,
            episodes: episodesData.length
        };
        
    } catch (err) {
        console.error('Main process error:', err);
        throw err;
    }
}

// Helper function to enrich series with TMDB data
async function enrichSeriesWithTMDB(series) {
    try {
        console.log(`Enriching series: ${series.serie_title} (${series.release_year})`);
        
        // Search TMDB for the series
        const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(series.serie_title)}${series.release_year ? `&first_air_date_year=${series.release_year}` : ''}`;
        const searchResponse = await axios.get(searchUrl);
        
        const results = searchResponse.data.results;
        console.log(`TMDB search results for "${series.serie_title}": ${results.length} matches`);
        
        if (results.length === 0) {
            console.log(`No TMDB match for ${series.serie_title}`);
            return {
                ...series,
                description: '',
                rating: null,
                image_url: null,
                trailer: null,
                tmdb_id: null,
                genres: []
            };
        }
        
        const tvShow = results[0];
        const tmdbId = tvShow.id;
        
        // Get detailed series information
        const detailsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data;
        
        // Get series videos (for trailers)
        let trailerUrl = null;
        try {
            const videosUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
            const videosResponse = await axios.get(videosUrl);
            const videos = videosResponse.data.results;
            
            const trailer = videos.find(video => 
                (video.type === 'Trailer' || video.type === 'Teaser') && 
                video.site === 'YouTube'
            );
            
            if (trailer) {
                trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
                console.log(`Found trailer for ${series.serie_title}: ${trailerUrl}`);
            }
        } catch (err) {
            console.error(`Error fetching videos for ${series.serie_title}:`, err.message);
        }
        
        const posterUrl = tvShow.poster_path ? 
            `https://image.tmdb.org/t/p/w500${tvShow.poster_path}` : null;
            
        // Extract genres
        const genres = details.genres ? details.genres.map(g => g.name) : [];
        
        return {
            serie_title: series.serie_title,
            description: details.overview || '',
            release_year: series.release_year || (details.first_air_date ? parseInt(details.first_air_date.split('-')[0]) : null),
            total_seasons: details.number_of_seasons || series.total_seasons || 0,
            total_episodes: details.number_of_episodes || series.total_episodes || 0,
            rating: details.vote_average || null,
            image_url: posterUrl,
            trailer: trailerUrl,
            type_id: 2, // Assuming 2 is for Series in your Types table
            tmdb_id: tmdbId,
            genres: genres
        };
        
    } catch (err) {
        console.error(`TMDB enrichment error for series ${series.serie_title}:`, err.message);
        return {
            ...series,
            description: '',
            rating: null,
            image_url: null,
            trailer: null,
            tmdb_id: null,
            genres: []
        };
    }
}

// Helper function to enrich season with TMDB data
async function enrichSeasonWithTMDB(season, serieId, tmdbId) {
    try {
        if (!tmdbId) {
            console.log(`No TMDB ID available for this series, minimal season enrichment for S${season.season_number}`);
            return {
                season_number: season.season_number,
                season_title: season.season_title || `Season ${season.season_number}`,
                season_description: '',
                episode_count: season.episode_count || 0,
                image_url: null,
                trailer: null
            };
        }
        
        console.log(`Fetching season ${season.season_number} from TMDB (ID: ${tmdbId})`);
        
        // Get detailed season information
        const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_API_KEY}`;
        const seasonResponse = await axios.get(seasonUrl);
        const seasonDetails = seasonResponse.data;
        
        console.log(`Season ${season.season_number} - Title: "${seasonDetails.name}", Episodes: ${seasonDetails.episodes?.length}`);
        
        const posterUrl = seasonDetails.poster_path ? 
            `https://image.tmdb.org/t/p/w500${seasonDetails.poster_path}` : null;
            
        return {
            season_number: season.season_number,
            season_title: seasonDetails.name || `Season ${season.season_number}`,
            season_description: seasonDetails.overview || '',
            episode_count: seasonDetails.episodes?.length || season.episode_count || 0,
            image_url: posterUrl,
            trailer: null // TMDB doesn't provide trailers per season
        };
        
    } catch (err) {
        console.error(`TMDB enrichment error for season ${season.season_number}:`, err.message);
        return {
            season_number: season.season_number,
            season_title: season.season_title || `Season ${season.season_number}`,
            season_description: '',
            episode_count: season.episode_count || 0,
            image_url: null,
            trailer: null
        };
    }
}

// Helper function to enrich episode with TMDB data
async function enrichEpisodeWithTMDB(episode, serieId, seasonId, tmdbId) {
    try {
        if (!tmdbId) {
            console.log(`No TMDB ID available for this series, minimal episode enrichment for S${episode.season_number}E${episode.episode_number}`);
            return {
                episode_title: `Episode ${episode.episode_number}`,
                episode_description: '',
                duration: null,
                release_date: null,
                rating: null,
                image_url: null,
                tmdb_id: null
            };
        }
        
        // Get detailed episode information
        const episodeUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${episode.season_number}/episode/${episode.episode_number}?api_key=${TMDB_API_KEY}`;
        console.log(`Fetching episode from TMDB: S${episode.season_number}E${episode.episode_number} (Series TMDB ID: ${tmdbId})`);
        
        const episodeResponse = await axios.get(episodeUrl);
        const episodeDetails = episodeResponse.data;
        
        // ADDED: Enhanced logging to debug what TMDB returns
        console.log(`Episode ${episode.episode_number} TMDB data:`);
        console.log(`  - Name: "${episodeDetails.name}"`);
        console.log(`  - Overview length: ${episodeDetails.overview?.length || 0} characters`);
        console.log(`  - Air date: ${episodeDetails.air_date}`);
        console.log(`  - Runtime: ${episodeDetails.runtime} minutes`);
        console.log(`  - Rating: ${episodeDetails.vote_average}`);
        
        const stillUrl = episodeDetails.still_path ? 
            `https://image.tmdb.org/t/p/w300${episodeDetails.still_path}` : null;
        
        // Format release date if available
        let releaseDate = null;
        if (episodeDetails.air_date) {
            try {
                releaseDate = episodeDetails.air_date;
            } catch (err) {
                console.error(`Error parsing date for episode ${episode.episode_number}:`, err.message);
            }
        }
        
        const enrichedData = {
            episode_title: episodeDetails.name && episodeDetails.name.trim() ? 
                episodeDetails.name : `Episode ${episode.episode_number}`,
            episode_description: episodeDetails.overview || '',
            duration: episodeDetails.runtime || null,
            release_date: releaseDate,
            rating: episodeDetails.vote_average || null,
            image_url: stillUrl,
            tmdb_id: episodeDetails.id
        };
        
        console.log(`✓ Enriched episode ${episode.episode_number} with title: "${enrichedData.episode_title}"`);
        
        return enrichedData;
        
    } catch (err) {
        console.error(`TMDB enrichment error for S${episode.season_number}E${episode.episode_number}:`, err.message);
        if (err.response) {
            console.error(`  - Status: ${err.response.status}`);
            console.error(`  - Message: ${err.response.data?.status_message || 'Unknown error'}`);
        }
        return {
            episode_title: `Episode ${episode.episode_number}`,
            episode_description: '',
            duration: null,
            release_date: null,
            rating: null,
            image_url: null,
            tmdb_id: null
        };
    }
}

// Helper function to add genres to a series
async function addGenresToSeries(serieId, genres) {
    try {
        for (const genreName of genres) {
            // 1. Ensure genre exists in Genre table
            let genreId;
            const { data: genreData, error: genreError } = await supabase
                .from('Genre')
                .select('genre_id')
                .eq('genre', genreName)
                .single();

            if (genreData) {
                genreId = genreData.genre_id;
            } else {
                // Insert new genre
                const { data: newGenre, error: insertError } = await supabase
                    .from('Genre')
                    .insert([{ genre: genreName }])
                    .select()
                    .single();
                    
                if (insertError) {
                    console.error(`Error inserting genre ${genreName}:`, insertError);
                    continue;
                }
                
                genreId = newGenre?.genre_id;
            }

            if (genreId) {
                // 2. Check if the relationship already exists
                const { data: existingLink, error: checkError } = await supabase
                    .from('SeriesGenres')
                    .select('id')
                    .eq('serie_id', serieId)
                    .eq('genre_id', genreId)
                    .maybeSingle();
                    
                if (!existingLink) {
                    // 3. Insert into SeriesGenres join table if it doesn't exist
                    const { error: linkError } = await supabase
                        .from('SeriesGenres')
                        .insert([{ serie_id: serieId, genre_id: genreId }]);
                        
                    if (linkError) {
                        console.error(`Error linking genre ${genreName} to series ${serieId}:`, linkError);
                    } else {
                        console.log(`Linked genre ${genreName} to series ${serieId}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`Error adding genres to series ${serieId}:`, err.message);
    }
}

// Export main function
export { importAndEnrichSeries };