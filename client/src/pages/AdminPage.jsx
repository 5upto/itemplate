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

  // Inventories admin panel state
  const [inventories, setInventories] = useState([]);
  const [invTotalCount, setInvTotalCount] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invLimit, setInvLimit] = useState(10);
  const [invSearch, setInvSearch] = useState('');
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState('');

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

  // Load inventories for admin
  const loadInventories = async () => {
    try {
      setInvLoading(true);
      setInvError('');
      const { data } = await axios.get('/api/inventories', {
        params: { page: invPage, limit: invLimit, search: invSearch }
      });
      // server returns { inventories, totalCount, totalPages, currentPage }
      setInventories(Array.isArray(data.inventories) ? data.inventories : []);
      setInvTotalCount(typeof data.totalCount === 'number' ? data.totalCount : (data.inventories?.length || 0));
    } catch (err) {
      console.error(err);
      setInvError(err.response?.data?.message || 'Failed to load inventories');
      toast.error(err.response?.data?.message || 'Failed to load inventories');
    } finally {
      setInvLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadInventories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, invPage, invLimit]);

  const handleInvSearch = (e) => {
    e.preventDefault();
    setInvPage(1);
    loadInventories();
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

        {/* Inventories Panel */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Inventories</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total: {invTotalCount}</div>
          </div>

          <form onSubmit={handleInvSearch} className="flex items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Search inventories..."
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
              disabled={invLoading}
            >
              Search
            </button>
          </form>

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">Visibility</th>
                  <th className="px-3 py-2 text-left">Items</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invLoading ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-6 text-center text-gray-600 dark:text-gray-300">Loading...</td>
                  </tr>
                ) : inventories.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-6 text-center text-gray-600 dark:text-gray-300">No inventories found</td>
                  </tr>
                ) : (
                  inventories.map(inv => (
                    <tr key={inv.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        <Link to={`/inventories/${inv.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{inv.title}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        {inv.creator ? (
                          <div className="flex items-center gap-2">
                            {inv.creator.avatar ? (
                              <img src={inv.creator.avatar} alt={inv.creator.username} className="h-6 w-6 rounded-full" />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                            )}
                            <span>{inv.creator.firstName || inv.creator.username}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-1 text-xs rounded ${inv.isPublic ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300'}`}>
                          {inv.isPublic ? 'Public' : 'Private'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{inv.itemCount ?? 0}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{new Date(inv.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Link to={`/inventories/${inv.id}`} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white">View</Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Inventories Pagination */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Page {invPage} of {Math.max(1, Math.ceil(invTotalCount / invLimit))}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                onClick={() => setInvPage(p => Math.max(1, p - 1))}
                disabled={invPage <= 1 || invLoading}
              >
                Previous
              </button>
              <button
                className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                onClick={() => setInvPage(p => p + 1)}
                disabled={invLoading || invPage >= Math.max(1, Math.ceil(invTotalCount / invLimit))}
              >
                Next
              </button>
              <select
                value={invLimit}
                onChange={(e) => { setInvLimit(parseInt(e.target.value, 10)); setInvPage(1); }}
                className="ml-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm"
              >
                {[10,20,50].map(n => <option key={n} value={n}>{n}/page</option>)}
              </select>
            </div>
          </div>
          {invError && <div className="mt-2 text-sm text-red-600">{invError}</div>}
        </div>
      </div>
    </div>
  );
}
