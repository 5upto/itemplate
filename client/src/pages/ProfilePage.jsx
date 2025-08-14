import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import InventoryCard from '../components/Inventory/InventoryCard';

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const idToLoad = id || user?.id;

  const { data, isLoading, isError, error } = useQuery(
    ['user:profile', idToLoad],
    () => axios.get(`/api/users/${idToLoad}`).then((r) => r.data),
    {
      enabled: !!idToLoad,
      staleTime: 5 * 60 * 1000,
    }
  );

  const canViewPrivates = !!user && (String(user.id) === String(idToLoad) || user.isAdmin);
  const { data: invData } = useQuery(
    ['user:inventories', idToLoad],
    () => axios.get(`/api/users/${idToLoad}/inventories`).then((r) => r.data),
    {
      enabled: !!idToLoad && canViewPrivates,
      staleTime: 2 * 60 * 1000,
    }
  );

  if (!idToLoad) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <p className="text-gray-700 dark:text-gray-300">Sign in to view your profile.</p>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) {
    const msg = error?.response?.data?.message || error?.message || 'Failed to load profile';
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <p className="text-red-600 dark:text-red-400">{msg}</p>
      </div>
    );
  }

  const profile = data || {};
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username;
  const inventories = Array.isArray(profile.createdInventories) ? profile.createdInventories : [];
  const owned = Array.isArray(invData?.owned) ? invData.owned : inventories; // fallback to limited created list
  const accessible = Array.isArray(invData?.accessible) ? invData.accessible : [];

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex items-center gap-4 mb-6">
        {profile.avatar ? (
          <img src={profile.avatar} alt={fullName} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        )}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{fullName}</h1>
          <p className="text-gray-600 dark:text-gray-400">{profile.email}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Joined {new Date(profile.createdAt).toLocaleDateString()}</p>
        </div>
        {canViewPrivates && (
          <div className="ml-auto">
            <Link
              to="/inventories/create"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
            >
              Create Inventory
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Owned Inventories</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">{owned.length}</span>
          </div>
          {owned.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No inventories yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {owned.map((inv) => (
                <InventoryCard key={inv.id} inventory={{ ...inv, itemCount: inv.itemCount ?? 0 }} />
              ))}
            </div>
          )}
        </section>

        {canViewPrivates && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Accessible Inventories</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">{accessible.length}</span>
            </div>
            {accessible.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No shared inventories.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {accessible.map((inv) => (
                  <InventoryCard key={inv.id} inventory={{ ...inv, itemCount: inv.itemCount ?? 0 }} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
