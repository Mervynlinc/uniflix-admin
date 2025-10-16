'use client';
import React from 'react';
import { RefreshCw, Server, Eye, EyeOff, Trash2, Search, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';

export default function ServerManagement() {
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Server className="w-8 h-8 text-blue-600" />
                Server Management
              </h1>
              <p className="text-gray-400 mt-1">Monitor and manage content servers</p>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Search className="w-4 h-4" />
                Scan for New Servers
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                <RefreshCw className="w-4 h-4" />
                Check All Servers
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">0</div>
              <div className="text-sm text-gray-400">Total Servers</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">0</div>
              <div className="text-sm text-gray-600">Online</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">0</div>
              <div className="text-sm text-gray-600">Offline</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">0</div>
              <div className="text-sm text-gray-600">Visible</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-gray-900 rounded-lg shadow-sm p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search servers by name or URL..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Server List */}
        <div className="bg-gray-900 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Server
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Content
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Checked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Visibility
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-900 divide-y divide-gray-200">
                <tr className="hover:bg-gray-900">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-white">Server Name</div>
                      <div className="text-sm text-gray-400 truncate max-w-xs">http://example.com</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium text-gray-600 bg-gray-100">
                      <Activity className="w-4 h-4" />
                      checking
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-white">-</td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-white">0 movies</div>
                    <div className="text-sm text-gray-400">0 episodes</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">Never</td>
                  <td className="px-6 py-4">
                    <button
                      className="p-2 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200"
                      title="Content Hidden"
                    >
                      <EyeOff className="w-5 h-5" />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Check Status"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="View Logs"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Server"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-center py-12 text-gray-500">Backend in progress...</div>
        </div>
      </div>
    </div>
  );
}