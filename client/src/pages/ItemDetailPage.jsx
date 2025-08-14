import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Package, Tag as TagIcon, User as UserIcon, Hash as HashIcon, Heart, Copy } from 'lucide-react';

export default function ItemDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const [likeSubmitting, setLikeSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  const { data, isLoading, isError, error } = useQuery(
    ['item:detail', id],
    async () => {
      const res = await axios.get(`/api/items/${id}`);
      const d = res.data;
      return d?.item || d; // support both shapes
    },
    { enabled: !!id }
  );

  const item = data || {};
  const serverLikeCount = typeof item.likeCount === 'number' ? item.likeCount : item.likes?.length || 0;
  const serverIsLiked = (() => {
    if (typeof item.liked === 'boolean') return item.liked;
    if (!Array.isArray(item.likes) || !user) return undefined;
    const uid = user.id || user._id;
    const inArray = item.likes.some((l) => {
      if (typeof l === 'string') return l === uid;
      if (l && typeof l === 'object') return l.id === uid || l._id === uid;
      return false;
    });
    return inArray;
  })();

  // Sync local state from server whenever data changes
  useEffect(() => {
    setCount(serverLikeCount || 0);
    // Only overwrite local liked if server provides definitive info
    const hasServerLikedInfo = typeof item.liked === 'boolean' || Array.isArray(item.likes);
    if (hasServerLikedInfo && typeof serverIsLiked !== 'undefined') {
      setLiked(!!serverIsLiked);
    }
  }, [serverLikeCount, serverIsLiked, item.id]);

  const onLike = async () => {
    if (!isAuthenticated || likeSubmitting) return;
    setLikeSubmitting(true);
    const prevLiked = liked;
    const prevCount = count;
    // optimistic toggle
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setCount(Math.max(0, prevCount + (nextLiked ? 1 : -1)));
    try {
      await axios.post(`/api/items/${id}/like`);
      await qc.invalidateQueries(['item:detail', id]);
    } catch (e) {
      // rollback on error
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setLikeSubmitting(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      if (!text) return;
      await navigator.clipboard.writeText(String(text));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(t('common.copyFailed', { defaultValue: 'Copy failed' }));
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6"><LoadingSpinner /></div>
    );
  }
  if (isError) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-red-600 dark:text-red-400">{error?.message || 'Failed to load item'}</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Breadcrumbs */}
      <nav className="text-sm mb-4 text-gray-600 dark:text-gray-300">
        <Link to="/" className="hover:underline">{t('nav.home', { defaultValue: 'Home' })}</Link>
        <span className="mx-2">/</span>
        <Link to="/inventories" className="hover:underline">{t('nav.inventories', { defaultValue: 'Inventories' })}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-800 dark:text-gray-100">{item.title || t('item.detail', { defaultValue: 'Item Details' })}</span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{item.title || t('item.detail', { defaultValue: 'Item Details' })}</h1>
        <button
          onClick={onLike}
          disabled={!isAuthenticated || likeSubmitting}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
          aria-label={(liked ? t('item.unlike', { defaultValue: 'Unlike' }) : t('item.like', { defaultValue: 'Like' }))}
        >
          {liked ? (
            <Heart className="h-4 w-4 text-red-500" fill="currentColor" />
          ) : (
            <Heart className="h-4 w-4" />
          )}
          {(liked ? t('item.unlike', { defaultValue: 'Unlike' }) : t('item.like', { defaultValue: 'Like' }))} • {count}
        </button>
      </div>

      {item.image && (
        <img src={item.image} alt={item.title} className="w-full h-64 object-cover rounded mb-4" />
      )}

      {item.description && (
        <p className="text-gray-700 dark:text-gray-300 mb-4">{item.description}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Package className="h-4 w-4" />
          <span className="font-medium">{t('fields.inventory', { defaultValue: 'Inventory' })}</span>:
          <span>{item.inventoryTitle || item.inventory?.title || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <UserIcon className="h-4 w-4" />
          <span className="font-medium">{t('fields.owner', { defaultValue: 'Owner' })}</span>:
          <span>{item.ownerName || item.owner?.name || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <HashIcon className="h-4 w-4" />
          <span className="font-medium">{t('fields.customId', { defaultValue: 'Custom ID' })}</span>:
          {item.customId || item.serial ? (
            <span className="inline-flex items-center gap-2">
              <code className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">{item.customId || item.serial}</code>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={t('common.copy', { defaultValue: 'Copy' })}
                onClick={() => copyToClipboard(item.customId || item.serial)}
              >
                <Copy className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <span>-</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">{t('fields.createdAt', { defaultValue: 'Created' })}</span>:
          <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</span>
        </div>
      </div>

      {Array.isArray(item.tags) && item.tags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <TagIcon className="h-4 w-4" />
            {t('fields.tags', { defaultValue: 'Tags' })}
          </div>
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tg) => (
              <span key={tg} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">{tg}</span>
            ))}
          </div>
        </div>
      )}

      {item.customFields && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('fields.customFields', { defaultValue: 'Custom Fields' })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(item.customFields).map(([key, val]) => (
              <div key={key} className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">{key}</span>: {String(val)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link to="/inventories" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.inventories', { defaultValue: 'Inventories' })}</Link>
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.home', { defaultValue: 'Home' })}</Link>
      </div>
    </div>
  );
}
