'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Film, 
  Layers, 
  Tag, 
  Folder, 
  Download, 
  Calendar, 
  TrendingUp,
  RefreshCcw
} from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    movies: 0,
    genres: 0,
    series: 0,
    categories: 0,
    totalDownloads: 0,
    recentUploads: 0,
    storageUsage: 0,
    storageLimit: 500,
    storageUsed: 0
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [topMovies, setTopMovies] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [categoryDistribution, setCategoryDistribution] = useState([]);

  const BACKEND_API_URL = process.env.NEXT_PUBLIC_ADMIN_API;
  
  // Fetch dashboard data from the API
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('adminToken');
        
        if (!token) {
          console.error('No authentication token found');
          return;
        }
        
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        // Fetch main dashboard stats
        const statsResponse = await fetch(`${BACKEND_API_URL}/dashboard/stats`, { headers });
        if (!statsResponse.ok) throw new Error('Failed to fetch dashboard stats');
        const statsData = await statsResponse.json();
        setStats(statsData);
        
        // Fetch top movies
        const topMoviesResponse = await fetch(`${BACKEND_API_URL}/dashboard/top-movies`, { headers });
        if (!topMoviesResponse.ok) throw new Error('Failed to fetch top movies');
        const topMoviesData = await topMoviesResponse.json();
        setTopMovies(topMoviesData.map(movie => ({
          id: movie.movie_id,
          title: movie.movie_title,
          downloads: movie.download_count || 0,
          rating: movie.rating || 0
        })));
        
        // Fetch category distribution
        const categoryResponse = await fetch(`${BACKEND_API_URL}/dashboard/category-distribution`, { headers });
        if (!categoryResponse.ok) throw new Error('Failed to fetch category distribution');
        const categoryData = await categoryResponse.json();
        setCategoryDistribution(categoryData);
        
        // For recent activity (mock data for now)
        setRecentActivity([
          { id: 1, action: 'Movie Added', item: 'Dune: Part Two', time: '2 hours ago' },
          { id: 2, action: 'Series Updated', item: 'Stranger Things', time: '4 hours ago' },
          { id: 3, action: 'Movie Enriched', item: 'Oppenheimer', time: '1 day ago' },
          { id: 4, action: 'Category Added', item: 'Documentaries', time: '2 days ago' }
        ]);
        
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  // Stat card component with improved icon centering
  const StatCard = ({ title, value, icon, description, loading, color = "text-teal-400", bgColor = "bg-teal-500/10" }) => (
    <Card className="bg-gray-800/40 border-gray-700 hover:bg-gray-800/60 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-100">{title}</CardTitle>
        <div className={`h-9 w-9 rounded-full ${bgColor} flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-20 bg-gray-700" />
        ) : (
          <div className="text-2xl font-bold text-white">{value}</div>
        )}
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      </CardContent>
    </Card>
  );

  // Custom progress bar to replace the problematic component
  const CustomProgressBar = ({ value, className, color }) => (
    <div className={`h-2 w-full bg-gray-700 rounded-full overflow-hidden ${className}`}>
      <div 
        className={`h-full ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Dashboard</h1>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
          className="border-gray-700  hover:bg-gray-800 text-black hover:text-white"
        >
          <RefreshCcw className="mr-2 black hover:white  h-4 w-4" />
          Refresh
        </Button>
      </div>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-gray-800/40 text-gray-400 border border-gray-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
            Analytics
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          {/* Primary metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Total Movies" 
              value={stats.movies}
              icon={<Film className="h-5 w-5" />}
              description="Movies in database"
              loading={isLoading}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <StatCard 
              title="TV Series" 
              value={stats.series}
              icon={<Layers className="h-5 w-5" />}
              description="TV shows collection"
              loading={isLoading}
              color="text-purple-400"
              bgColor="bg-purple-500/10"
            />
            <StatCard 
              title="Genres" 
              value={stats.genres}
              icon={<Tag className="h-5 w-5" />}
              description="Available genres"
              loading={isLoading}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            />
            <StatCard 
              title="Categories" 
              value={stats.categories}
              icon={<Folder className="h-5 w-5" />}
              description="Content categories"
              loading={isLoading}
              color="text-green-400"
              bgColor="bg-green-500/10"
            />
          </div>
          
          {/* Secondary metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard 
              title="Total Downloads" 
              value={stats.totalDownloads.toLocaleString()}
              icon={<Download className="h-5 w-5" />}
              description="All time downloads"
              loading={isLoading}
            />
            <StatCard 
              title="Recent Uploads" 
              value={stats.recentUploads}
              icon={<Calendar className="h-5 w-5" />}
              description="Added in last 30 days"
              loading={isLoading}
            />
            <Card className="bg-gray-800/40 border-gray-700 hover:bg-gray-800/60 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-100">Storage Usage</CardTitle>
                <div className="h-9 w-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-full bg-gray-700" />
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium text-white">{stats.storageUsage}% used</div>
                      <div className="text-xs text-gray-400">{stats.storageUsed} / {stats.storageLimit} MB</div>
                    </div>
                    <CustomProgressBar value={stats.storageUsage} color="bg-red-500" />
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">Supabase free tier storage</p>
              </CardContent>
            </Card>
          </div>
          
          {/* Top movies section */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-gray-800/40 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white">Top Movies</CardTitle>
                <CardDescription className="text-gray-400">Most downloaded content</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="h-9 w-9 rounded-md bg-gray-700" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-[180px] bg-gray-700" />
                            <Skeleton className="h-3 w-[100px] bg-gray-700" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-[50px] bg-gray-700" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {topMovies.map((movie, index) => (
                      <div key={movie.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center justify-center h-9 w-9 rounded-md bg-gray-700 text-white font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-white">{movie.title}</p>
                            <p className="text-xs text-gray-400">Rating: {movie.rating.toFixed(1)}/5</p>
                          </div>
                        </div>
                        <div className="flex items-center text-sm">
                          <Download className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="text-white">{movie.downloads}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="ghost" size="sm" className="w-full text-blue-400 hover:text-blue-300 hover:bg-gray-700">
                  View All Movies
                </Button>
              </CardFooter>
            </Card>
            
            {/* Recent activity */}
            <Card className="bg-gray-800/40 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white">Recent Activity</CardTitle>
                <CardDescription className="text-gray-400">Latest system events</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-4 w-full bg-gray-700" />
                        <Skeleton className="h-3 w-20 bg-gray-700" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentActivity.map((activity) => (
                      <div key={activity.id} className="border-b border-gray-700 pb-3 last:border-0 last:pb-0">
                        <p className="text-sm text-white">
                          <span className="font-medium">{activity.action}:</span> {activity.item}
                        </p>
                        <p className="text-xs text-gray-400">{activity.time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="ghost" size="sm" className="w-full text-blue-400 hover:text-blue-300 hover:bg-gray-700">
                  View Activity Log
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {/* Content distribution */}
          <Card className="bg-gray-800/40 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white">Content Distribution</CardTitle>
              <CardDescription className="text-gray-400">Breakdown by type and category</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 pt-2">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-white">By Content Type</div>
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-gray-300">Movies</div>
                      <div className="text-gray-300">{isLoading ? '-' : `${Math.round((stats.movies / (stats.movies + stats.series)) * 100)}%`}</div>
                    </div>
                    <CustomProgressBar 
                      value={isLoading ? 0 : Math.round((stats.movies / (stats.movies + stats.series)) * 100)} 
                      color="bg-blue-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-gray-300">TV Series</div>
                      <div className="text-gray-300">{isLoading ? '-' : `${Math.round((stats.series / (stats.movies + stats.series)) * 100)}%`}</div>
                    </div>
                    <CustomProgressBar 
                      value={isLoading ? 0 : Math.round((stats.series / (stats.movies + stats.series)) * 100)} 
                      color="bg-purple-500" 
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-white">By Category</div>
                </div>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3 w-24 bg-gray-700" />
                          <Skeleton className="h-3 w-12 bg-gray-700" />
                        </div>
                        <Skeleton className="h-2 w-full bg-gray-700" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {categoryDistribution.slice(0, 4).map((category, index) => {
                      // Use different colors for each category
                      const colors = ["bg-teal-500", "bg-amber-500", "bg-red-500", "bg-gray-500"];
                      const total = categoryDistribution.reduce((sum, cat) => sum + cat.count, 0);
                      const percentage = Math.round((category.count / total) * 100);
                      
                      return (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="text-gray-300">{category.name}</div>
                            <div className="text-gray-300">{percentage}%</div>
                          </div>
                          <CustomProgressBar 
                            value={percentage}
                            color={colors[index % colors.length]} 
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="analytics" className="space-y-4">
          <Card className="bg-gray-800/40 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Advanced Analytics</CardTitle>
              <CardDescription className="text-gray-400">Detailed metrics and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center border border-dashed border-gray-700 rounded-lg">
                <div className="text-center">
                  <h3 className="text-lg font-medium text-white">Analytics Dashboard</h3>
                  <p className="text-sm text-gray-400 mt-1">Advanced analytics module coming soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}