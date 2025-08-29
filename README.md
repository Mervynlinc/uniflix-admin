### Uniflix Admin Backend
This is the backend for the Uniflix Admin dashboard. It provides APIs and tools for managing movies, categories, genres, and enrichment from TMDB, as well as scraping and importing movie data.

### Features
### Movie Management
Add, update, and enrich movies with metadata from TMDB.

### Genre & Category Management
Normalized schema for genres and categories.

### Movie Scraper
Scrape movie files from remote directories and export to Excel.

### Excel Import
Import movies from Excel files with duplicate detection.

### Enrichment
Automatically enrich movies with TMDB data (plot, poster, rating, genres, etc.).

### Authentication
JWT-based admin authentication.
Dashboard Stats: Get stats for movies, genres, categories, downloads, and more.
WebSocket Progress: Real-time progress updates for long-running tasks (import/enrich).
Security: Helmet, rate limiting, and CORS enabled.
Project Structure
