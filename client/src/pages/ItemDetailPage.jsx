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
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [likeSubmitting, setLikeSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  const { data, isLoading, isError, error } = useQuery(
    ['item:detail', id, user?.id || null],
    async () => {
      const res = await axios.get(`/api/items/${id}`);
      const d = res.data;
      return d?.item || d; // support both shapes
    },
    { enabled: !!id && authLoading === false }
  );

  const item = data || {};
  const invObj = item.inventory || item.Inventory || {};
  const inventoryId = item.inventoryId || invObj.id || invObj._id;
  const inventoryTitle = item.inventoryTitle || invObj.title;
  const serverLikeCount = (() => {
    if (typeof item.likeCount === 'number') return item.likeCount;
    if (Array.isArray(item.likeUsers)) return item.likeUsers.length;
    if (Array.isArray(item.likes)) return item.likes.length;
    return 0;
  })();
  const serverIsLiked = (() => {
    if (typeof item.isLikedByUser === 'boolean') return item.isLikedByUser;
    if (typeof item.liked === 'boolean') return item.liked;
    if (!user) return undefined;
    const uid = String(user.id || user._id);
    const arrays = [item.likeUsers, item.likes].filter(Array.isArray);
    const inArray = arrays.some(arr => arr.some((l) => {
      if (typeof l === 'string' || typeof l === 'number') return String(l) === uid;
      if (l && typeof l === 'object') return String(l.id ?? l._id ?? '') === uid;
      return false;
    }));
    return inArray;
  })();

  // Sync local state from server whenever data changes
  useEffect(() => {
    setCount(serverLikeCount || 0);
    // Only overwrite local liked if server provides definitive info
    const hasServerLikedInfo =
      typeof item.isLikedByUser === 'boolean' ||
      typeof item.liked === 'boolean' ||
      Array.isArray(item.likes) ||
      Array.isArray(item.likeUsers);
    if (hasServerLikedInfo && typeof serverIsLiked !== 'undefined') {
      setLiked(!!serverIsLiked);
    }
  }, [serverLikeCount, serverIsLiked, item.id, user?.id, Array.isArray(item.likeUsers) ? item.likeUsers.length : 0]);

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
      await qc.invalidateQueries(['item:detail', id, user?.id || null]);
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
        {inventoryId ? (
          <>
            <Link to={`/inventories/${inventoryId}`} className="hover:underline">{inventoryTitle || t('fields.inventory', { defaultValue: 'Inventory' })}</Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-gray-800 dark:text-gray-100">{item.title || t('item.detail', { defaultValue: 'Item Details' })}</span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{item.title || t('item.detail', { defaultValue: 'Item Details' })}</h1>
        <button
          onClick={onLike}
          disabled={!isAuthenticated || likeSubmitting}
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
          aria-label={t('item.toggleLike', { defaultValue: 'Toggle like' })}
        >
          {liked ? (
            <Heart className="h-4 w-4 text-red-500" fill="currentColor" />
          ) : (
            <Heart className="h-4 w-4" />
          )}
          {(liked ? t('item.liked', { defaultValue: 'Liked' }) : t('item.like', { defaultValue: 'Like' }))} • {count}
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
          {inventoryId ? (
            <Link to={`/inventories/${inventoryId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              {inventoryTitle || invObj.title || '-'}
            </Link>
          ) : (
            <span>{inventoryTitle || invObj.title || '-'}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <UserIcon className="h-4 w-4" />
          <span className="font-medium">{t('fields.owner', { defaultValue: 'Owner' })}</span>:
          {(() => {
            const creator = item.creator || {};
            const name = (
              item.ownerName ||
              item.owner?.name ||
              creator.username ||
              ((creator.firstName || creator.lastName) ? `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim() : '')
            ) || '-';
            const avatar = creator.avatar || creator.avatarUrl || creator.photo || '';
            const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
            return (
              <span className="inline-flex items-center gap-2">
                {name !== '-' && (
                  <img
                    src={avatar || fallback}
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.src = fallback; }}
                    alt={name}
                    className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                  />
                )}
                <span>{name}</span>
              </span>
            );
          })()}
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

      {(() => {
        // Build displayable fields from fixed slots and inventory template names
        const inv = item.inventory || item.Inventory || {};
        const isUrl = (s) => typeof s === 'string' && /^(https?:)?\/\//i.test(s);
        const isImageUrl = (s) => typeof s === 'string' && /(\.(png|jpe?g|gif|webp|bmp|svg|ico)$)|((cloudinary|images|img)\.)/i.test(s);
        const rows = [];
        const pushIf = (state, label, value, type) => {
          if (!state) return;
          const hasVal = value !== undefined && value !== null && value !== '';
          if (!hasVal) return;
          rows.push({ label: label || '', value, type });
        };
        pushIf(inv.custom_string1_state, inv.custom_string1_name, item.string1, 'string');
        pushIf(inv.custom_string2_state, inv.custom_string2_name, item.string2, 'string');
        pushIf(inv.custom_string3_state, inv.custom_string3_name, item.string3, 'string');
        pushIf(inv.custom_int1_state, inv.custom_int1_name, item.int1, 'number');
        pushIf(inv.custom_int2_state, inv.custom_int2_name, item.int2, 'number');
        pushIf(inv.custom_int3_state, inv.custom_int3_name, item.int3, 'number');
        pushIf(inv.custom_bool1_state, inv.custom_bool1_name, item.bool1, 'boolean');
        pushIf(inv.custom_bool2_state, inv.custom_bool2_name, item.bool2, 'boolean');
        pushIf(inv.custom_bool3_state, inv.custom_bool3_name, item.bool3, 'boolean');
        if (rows.length === 0) return null;
        return (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('fields.customFields', { defaultValue: 'Custom Fields' })}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rows.map((r, idx) => (
                <div key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">{r.label || t('fields.value', { defaultValue: 'Value' })}</span>:{' '}
                  {r.type === 'boolean' ? (
                    r.value ? 'Yes' : 'No'
                  ) : (typeof r.value === 'string' && isUrl(r.value)) ? (
                    isImageUrl(r.value) ? (
                      <a href={r.value} target="_blank" rel="noreferrer" className="inline-block align-middle">
                        <img
                          src={r.value}
                          alt={r.label}
                          className="w-14 h-14 object-cover rounded border border-gray-200 dark:border-gray-700"
                          referrerPolicy="no-referrer"
                        />
                      </a>
                    ) : (
                      <a href={r.value} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">{r.value}</a>
                    )
                  ) : (
                    String(r.value)
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex items-center gap-4">
        {inventoryId ? (
          <Link to={`/inventories/${inventoryId}`} className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.backToInventory', { defaultValue: 'Back to Inventory' })}</Link>
        ) : (
          <Link to="/inventories" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.inventories', { defaultValue: 'Inventories' })}</Link>
        )}
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.home', { defaultValue: 'Home' })}</Link>
      </div>
    </div>
  );
}
