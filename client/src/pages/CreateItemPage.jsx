import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/UI/LoadingSpinner';

export default function CreateItemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams(); // inventory id

  const { data: inventory, isLoading, error } = useQuery(['inventory', id], async () => {
    const res = await axios.get(`/api/inventories/${id}`);
    return res.data;
  });

  // Normalize inventory.customFields (supports array or object schema)
  const fieldDefs = useMemo(() => {
    const cf = inventory?.customFields;
    // If server returns an array of field definitions
    if (Array.isArray(cf)) {
      return cf.map((f) => ({
        ...f,
        key: f.key || f.name || f.id,
        label: f.label || f.name || f.key || f.id,
        type: f.type === 'documentImage' ? 'file' : (f.type || 'string'),
      }));
    }
    // Object/sectioned schema
    const defs = [];
    const obj = cf || {};
    const push = (arr, type) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((entry) => {
        if (typeof entry === 'string') {
          defs.push({ key: entry, type, label: entry, required: false });
        } else if (entry && typeof entry === 'object') {
          const key = entry.key || entry.name || entry.label;
          if (key) defs.push({ key, type, label: entry.label || key, required: !!entry.required });
        }
      });
    };
    push(obj.singleLineText, 'string');
    push(obj.multiLineText, 'text');
    push(obj.numeric, 'number');
    push(obj.boolean, 'boolean');
    push(obj.documentImage, 'file');
    return defs;
  }, [inventory]);

  const initialFields = useMemo(() => {
    const obj = {};
    fieldDefs.forEach((f) => { obj[f.key] = f.defaultValue ?? ''; });
    return obj;
  }, [fieldDefs]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customFields, setCustomFields] = useState({});
  // Force-remount file inputs to clear selected filenames when removing
  const [fileKeys, setFileKeys] = useState({});
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setCustomFields(initialFields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFields]);

  const onChange = (key, value) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
  };

  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post('/api/items/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.secure_url || res.data?.url;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!inventory) return;
    setSubmitting(true);
    try {
      const res = await axios.post('/api/items', {
        inventoryId: inventory.id,
        title: title?.trim() || undefined,
        description: description?.trim() || undefined,
        customFields,
      });
      navigate(`/items/${res.data.id}`);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.message || err.message || 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !inventory) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{t('messages.notFound')}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{t('inventory.inventoryNotFound') || 'Inventory not found.'}</p>
        <Link to="/inventories" className="text-blue-600 hover:underline">{t('nav.inventories')}</Link>
      </div>
    );
  }

  const fields = fieldDefs;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('inventory.addItem')} – {inventory.title}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {t('item.customIdNote')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        {fields.length === 0 && (
          <div className="text-gray-600 dark:text-gray-300">
            {t('item.noCustomFields')}
          </div>
        )}

        {/* Basic fields */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('fields.title') || 'Title'}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('fields.description') || 'Description (optional)'}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {fields.map((f) => {
          const key = f.key || f.name || f.id;
          const label = f.label || f.name || key;
          const type = f.type || 'string';
          const required = !!f.required;

          const value = customFields[key] ?? '';

          return (
            <div key={key} className="grid gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {label}
                {required && <span className="text-red-500">*</span>}
              </label>
              {type === 'number' ? (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => onChange(key, e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={required}
                />
              ) : type === 'text' ? (
                <textarea
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={required}
                />
              ) : type === 'file' || type === 'image' || type === 'documentImage' ? (
                <div className="space-y-2">
                  {value && typeof value === 'string' && (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img src={value} alt={label} className="w-20 h-20 object-cover rounded border border-gray-200 dark:border-gray-700" />
                        <span
                          onClick={() => { onChange(key, ''); setFileKeys((k) => ({ ...k, [key]: (k[key] || 0) + 1 })); }}
                          title={t('common.remove') || 'Remove'}
                          aria-label={t('common.remove') || 'Remove'}
                          className="absolute -top-1 -right-1 cursor-pointer select-none text-white text-sm leading-none"
                        >
                          ×
                        </span>
                      </div>
                      <a href={value} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">{t('common.view') || 'View'}</a>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    key={`file-${key}-${fileKeys[key] || 0}`}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await uploadFile(file);
                        onChange(key, url);
                      } catch (err) {
                        // eslint-disable-next-line no-alert
                        alert(err?.response?.data?.message || err.message || 'Upload failed');
                      }
                    }}
                    className="block w-full text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    required={required && !value}
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => onChange(key, e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={required}
                />
              )}
              {f.help && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.help}</p>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/inventories/${inventory.id}`}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? (t('common.saving') || 'Saving...') : (t('common.save') || 'Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
