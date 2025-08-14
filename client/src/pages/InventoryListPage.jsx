import React, { useState } from 'react';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Eye, Plus, Pencil, Trash2 } from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';

export default function InventoryListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [selected, setSelected] = useState([]);

  const { data, isLoading, isError, error, refetch } = useQuery(
    ['inventories:list', page, limit],
    () => axios
      .get('/api/inventories', { params: { page, limit } })
      .then((res) => res.data),
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const [deletingId, setDeletingId] = useState(null);

  const onDelete = async (id) => {
    try {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(t('inventory.confirmDelete') || 'Delete this inventory?');
      if (!ok) return;
      setDeletingId(id);
      await axios.delete(`/api/inventories/${id}`);
      await refetch();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || e.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm(t('inventory.confirmDelete') || 'Delete selected inventories?');
    if (!ok) return;
    try {
      for (const id of selected) {
        await axios.delete(`/api/inventories/${id}`);
      }
      await refetch();
      setSelected([]);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || e.message || 'Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-red-200 dark:border-red-800">
        <h1 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Failed to load inventories</h1>
        <p className="text-sm text-red-700 dark:text-red-300">{error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  const inventories = (() => {
    if (!data) return [];
    if (Array.isArray(data?.inventories)) return data.inventories;
    if (Array.isArray(data)) return data;
    return [];
  })();

  const total = typeof data?.total === 'number' ? data.total : undefined;
  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : undefined;

  const allSelected = selected.length > 0 && selected.length === inventories.length;

  const toggleAll = () => {
    setSelected(allSelected ? [] : inventories.map((i) => i.id));
  };

  const toggleOne = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('nav.inventories')}</h1>

        {/* Toolbar actions with icons (no per-row buttons) */}
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="mr-2 text-sm text-gray-600 dark:text-gray-300">
              {t('inventory.selectedItems', { count: selected.length })}
            </span>
          )}
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            onClick={() => selected[0] && navigate(`/inventories/${selected[0]}`)}
            disabled={selected.length !== 1}
            title={t('common.view')}
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.view')}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            onClick={() => selected[0] && navigate(`/inventories/${selected[0]}/items/new`)}
            disabled={selected.length !== 1}
            title={t('inventory.addItem')}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('inventory.addItem')}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            onClick={() => selected[0] && navigate(`/inventories/${selected[0]}/edit`)}
            disabled={selected.length !== 1}
            title={t('common.edit')}
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.edit')}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            onClick={deleteSelected}
            disabled={selected.length === 0}
            title={t('common.delete')}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.delete')}</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={t('common.select')}
                />
              </th>
              <th className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('common.image') || 'Image'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('inventory.customId')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('fields.title')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('common.createdBy')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('inventory.items')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {t('common.createdAt')}
              </th>
              {/* No actions column */}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {inventories.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-600 dark:text-gray-300">
                  {t('search.noResults')}
                </td>
              </tr>
            ) : (
              inventories.map((inv) => {
                const createdAt = inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '';
                const owner = inv.creator?.username || inv.owner?.username || inv.ownerName || '';
                const displayId = inv.displayId || inv.code || inv.id;
                const cover = inv.image || inv.imageUrl || inv.coverImage || inv.cover || '';
                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                    onClick={() => navigate(`/inventories/${inv.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                        checked={selected.includes(inv.id)}
                        onChange={() => toggleOne(inv.id)}
                        aria-label={t('common.select')}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {cover ? (
                        <img src={cover} alt={inv.name || inv.title} className="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{displayId}</td>
                    <td className="px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                      <span className="underline decoration-dotted">{inv.name || inv.title}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{owner}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{inv.itemCount ?? inv.itemsCount ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{createdAt}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous')}
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {page} / {totalPages}
          </span>
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            {t('common.next')}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
