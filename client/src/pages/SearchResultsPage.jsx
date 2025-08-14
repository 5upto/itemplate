import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/UI/LoadingSpinner';

export default function SearchResultsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get('q') || '').trim();
  const page = Number(params.get('page') || 1);
  const limit = Number(params.get('limit') || 10);

  const { data, isLoading, isError, error } = useQuery(
    ['search', q, page, limit],
    async () => {
      const res = await axios.get('/api/search', { params: { q, page, limit } });
      return res.data;
    },
    { enabled: q.length > 0 }
  );

  const inventories = Array.isArray(data?.inventories) ? data.inventories : [];
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = typeof data?.total === 'number' ? data.total : undefined;
  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : undefined;

  const goPage = (p) => {
    const sp = new URLSearchParams(params);
    sp.set('page', String(p));
    sp.set('limit', String(limit));
    navigate(`/search?${sp.toString()}`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h1 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('search.results')}</h1>

      {q ? (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{t('search.searchFor', { query: q, defaultValue: `Search for "${q}"` })}</p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{t('search.placeholder', { defaultValue: 'Search inventories and items...' })}</p>
      )}

      {isLoading && (
        <div className="py-8"><LoadingSpinner /></div>
      )}
      {isError && (
        <div className="py-4 text-red-600 dark:text-red-400">{error?.message || 'Search failed'}</div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('search.inventories', { defaultValue: 'Inventories' })}</h2>
            <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.title')}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.owner')}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.items', { defaultValue: 'Items' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {inventories.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">{t('search.noResults')}</td>
                    </tr>
                  )}
                  {inventories.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                      onClick={() => navigate(`/inventories/${inv.id}`)}
                    >
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{inv.id}</td>
                      <td className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 underline">{inv.title}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{inv.ownerName || inv.owner?.name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{inv.itemCount ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('search.items', { defaultValue: 'Items' })}</h2>
            <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.title')}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.inventory')}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.customId')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">{t('search.noResults')}</td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                      onClick={() => navigate(`/items/${it.id}`)}
                    >
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{it.id}</td>
                      <td className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 underline">{it.title}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{it.inventoryTitle || it.inventory?.title || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{it.customId || it.serial || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {totalPages && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => goPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-60"
              >
                {t('common.previous')}
              </button>
              <div className="text-sm text-gray-600 dark:text-gray-300">Page {page} of {totalPages}</div>
              <button
                onClick={() => goPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-60"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
