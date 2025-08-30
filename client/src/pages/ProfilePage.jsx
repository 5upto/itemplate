import React, { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import InventoryCard from '../components/Inventory/InventoryCard';

export default function ProfilePage() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const idToLoad = id || user?.id;
  const isOwnProfile = !!user && String(user.id) === String(idToLoad);
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

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

  const avatarMutation = useMutation(
    async (file) => {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/api/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    {
      onMutate: () => setUploading(true),
      onSettled: async () => {
        setUploading(false);
        // Refresh current user (Navbar avatar) and this profile
        await refreshUser?.();
        await queryClient.invalidateQueries(['user:profile', idToLoad]);
      },
    }
  );

  const handleAvatarClick = () => {
    if (isOwnProfile && fileInputRef.current && !uploading) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) avatarMutation.mutate(file);
    // reset input so selecting same file again retriggers change
    e.target.value = '';
  };

  if (!idToLoad) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow">
        <p className="text-gray-700">Sign in to view your profile.</p>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) {
    const msg = error?.response?.data?.message || error?.message || 'Failed to load profile';
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow">
        <p className="text-red-600">{msg}</p>
      </div>
    );
  }

  const profile = data || {};
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username;
  const inventories = Array.isArray(profile.createdInventories) ? profile.createdInventories : [];
  const owned = Array.isArray(invData?.owned) ? invData.owned : inventories; // fallback to limited created list
  const accessible = Array.isArray(invData?.accessible) ? invData.accessible : [];

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          {profile.avatar ? (
            <img
              src={`${profile.avatar}${profile.avatar.includes('?') ? '&' : '?'}_=${Date.now()}`}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const name = encodeURIComponent(fullName || profile.username || 'User');
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${name}&background=random`;
              }}
              alt={fullName}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200" />
          )}
          {isOwnProfile && (
            <>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploading}
                title={uploading ? 'Uploading…' : 'Edit avatar'}
                className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs shadow disabled:opacity-60"
              >
                {uploading ? '…' : '✎'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{fullName}</h1>
          <p className="text-gray-600">{profile.email}</p>
          <p className="text-sm text-gray-500">Joined {new Date(profile.createdAt).toLocaleDateString()}</p>
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
            <h2 className="text-xl font-semibold text-gray-900">Owned Inventories</h2>
            <span className="text-sm text-gray-500">{owned.length}</span>
          </div>
          {owned.length === 0 ? (
            <p className="text-gray-600">No inventories yet.</p>
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
              <h2 className="text-xl font-semibold text-gray-900">Accessible Inventories</h2>
              <span className="text-sm text-gray-500">{accessible.length}</span>
            </div>
            {accessible.length === 0 ? (
              <p className="text-gray-600">No shared inventories.</p>
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
