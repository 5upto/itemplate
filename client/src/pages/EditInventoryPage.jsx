import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/UI/LoadingSpinner';

export default function EditInventoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading, isError, error } = useQuery(
    ['inventory', id],
    () => axios.get(`/api/inventories/${id}`).then((r) => r.data),
    { enabled: !!id }
  );

  const [form, setForm] = useState({
    title: '',
    description: '',
    isPublic: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data) {
      setForm({
        title: data.title || '',
        description: data.description || '',
        isPublic: !!data.isPublic,
      });
    }
  }, [data]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const mutation = useMutation(async () => {
    const payload = new FormData();
    payload.set('title', form.title);
    payload.set('description', form.description);
    payload.set('isPublic', String(form.isPublic));
    // version is optional; backend supports optimistic locking if provided
    return axios.put(`/api/inventories/${id}`, payload);
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      await mutation.mutateAsync();
      navigate(`/inventories/${id}`);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to update inventory');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-red-600 dark:text-red-400 mb-2">{t('common.failedToLoad') || 'Failed to load'}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{error?.response?.data?.message || error?.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h1 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-gray-100">{t('inventory.edit') || 'Edit Inventory'}</h1>
      {err && <div className="mb-4 text-red-600 dark:text-red-400" role="alert">{err}</div>}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('fields.title')}</label>
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            required
            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('fields.description') || 'Description'}</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isPublic"
            type="checkbox"
            name="isPublic"
            checked={form.isPublic}
            onChange={onChange}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">{t('access.public')}</label>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-md"
          >
            {submitting ? <LoadingSpinner size="sm" /> : (t('common.save') || 'Save')}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('common.note') || 'Note'}: {t('inventory.editBasicOnly') || 'This page currently supports editing basic details. Custom ID format and custom fields editing will be added soon.'}
        </p>
      </form>
    </div>
  );
}
