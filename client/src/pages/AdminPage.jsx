import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / limit)), [totalCount, limit]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await axios.get('/api/users', {
        params: { page, limit, search }
      });
      setUsers(data.users || []);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load users');
      toast.error(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, limit]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const confirmAnd = async (message, fn) => {
    if (!window.confirm(message)) return;
    await fn();
  };

  const toggleAdmin = async (id) => {
    await confirmAnd('Toggle admin for this user?', async () => {
      await axios.put(`/api/users/${id}/admin`);
      toast.success('Toggled admin');
      loadUsers();
    });
  };

  const toggleBlock = async (id) => {
    await confirmAnd('Block/Unblock this user?', async () => {
      await axios.put(`/api/users/${id}/block`);
      toast.success('Updated block status');
      loadUsers();
    });
  };

  const deleteUser = async (id) => {
    await confirmAnd('Delete this user? This cannot be undone.', async () => {
      await axios.delete(`/api/users/${id}`);
      toast.success('User deleted');
      // If last item on page deleted, go back one page when appropriate
      if (users.length === 1 && page > 1) {
        setPage(p => p - 1);
      } else {
        loadUsers();
      }
    });
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-gray-100">403 - Forbidden</h1>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          You do not have permission to access the admin dashboard.
        </p>
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">Return to home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h1 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
      <p className="text-gray-700 dark:text-gray-300 mb-6">
        Welcome{user?.firstName ? `, ${user.firstName}` : user?.username ? `, ${user.username}` : ''}! Manage your application below.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users Panel */}
        <div className="lg:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Users</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total: {totalCount}</div>
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              disabled={loading}
            >
              Search
            </button>
          </form>

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Blocked</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-6 text-center text-gray-600 dark:text-gray-300">Loading...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-6 text-center text-gray-600 dark:text-gray-300">No users found</td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-3 py-2 flex items-center gap-2">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.username} className="h-8 w-8 rounded-full" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600" />
                        )}
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">{u.username}</div>
                          <div className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{u.email}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-1 text-xs rounded ${u.isAdmin ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300'}`}>
                          {u.isAdmin ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-1 text-xs rounded ${u.isBlocked ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300'}`}>
                          {u.isBlocked ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => toggleAdmin(u.id)} className="px-2 py-1 text-xs rounded bg-amber-500 hover:bg-amber-600 text-white">Toggle Admin</button>
                          <button onClick={() => toggleBlock(u.id)} className="px-2 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-700 text-white">Block/Unblock</button>
                          <button onClick={() => deleteUser(u.id)} className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </button>
              <button
                className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </button>
              <select
                value={limit}
                onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                className="ml-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm"
              >
                {[10,20,50].map(n => <option key={n} value={n}>{n}/page</option>)}
              </select>
            </div>
          </div>
          {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        </div>

        {/* Inventories Panel (placeholder) */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Inventories</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Moderation tools coming soon.</p>
        </div>
      </div>
    </div>
  );
}
