import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { getItemsListRequest, createItemRequest, canListItems, canCreateItems } from '../api/endpoints';
import { Calendar, Package, Tag } from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';

// Local helper to mirror server-side custom ID generation for preview purposes
// Supported element types:
//  - text: fixed string in element.value
//  - random20/random32/random6/random9: random hex/decimal strings
//  - guid: uuidv4-like placeholder (client preview uses crypto if available)
//  - datetime: formats 'YYYYMMDD' or 'YYYY-MM-DD'
//  - sequence: uses current item count + 1 with optional padding
const previewCustomId = (format = [], itemCount = 0) => {
  const randHex = (bits) => Math.floor(Math.random() * Math.pow(2, bits)).toString(16);
  const randDec = (max) => Math.floor(Math.random() * max).toString();
  const pad = (s, n, ch = '0') => s.padStart(n, ch);
  let out = '';
  const now = new Date();
  for (const el of format) {
    const type = el?.type;
    switch (type) {
      case 'text':
      case 'fixed':
        out += el?.value ?? '';
        break;
      case 'random20':
        out += pad(randHex(20), 5, '0');
        break;
      case 'random32':
        out += pad(randHex(32), 8, '0');
        break;
      case 'random6':
        out += pad(randDec(1_000_000), 6, '0');
        break;
      case 'random9':
        out += pad(randDec(1_000_000_000), 9, '0');
        break;
      case 'guid': {
        // Basic UUID preview; not guaranteed unique, just visual
        const uuid = (crypto?.randomUUID && crypto.randomUUID()) || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        out += uuid;
        break;
      }
      case 'datetime': {
        const f = el?.format || 'YYYYMMDD';
        const yyyy = now.getFullYear().toString();
        const mm = pad(String(now.getMonth() + 1), 2, '0');
        const dd = pad(String(now.getDate()), 2, '0');
        if (f === 'YYYY-MM-DD') out += `${yyyy}-${mm}-${dd}`;
        else out += `${yyyy}${mm}${dd}`;
        break;
      }
      case 'sequence': {
        const n = String((itemCount ?? 0) + 1);
        const padding = parseInt(el?.padding || 0, 10);
        out += padding > 0 ? pad(n, padding, '0') : n;
        break;
      }
      default:
        break;
    }
  }
  return out;
};

export default function InventoryDetailPage() {
  const { id } = useParams();

  const { data, isLoading, isError, error } = useQuery(
    ['inventory', id],
    () => axios.get(`/api/inventories/${id}`).then((r) => r.data),
    { enabled: !!id }
  );

  // Items list for this inventory
  // Prefer embedded items on the inventory payload to avoid extra requests
  const embeddedItems = Array.isArray(data?.items) ? data.items : null;
  const fetchItems = async () => {
    if (!canListItems()) return [];
    return getItemsListRequest(id, axios);
  };

  // Force-remount keys for file inputs in quick add
  const [fileKeys, setFileKeys] = React.useState({});
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery(
    ['inventory:items', id],
    fetchItems,
    { enabled: !!id && !embeddedItems && canListItems() }
  );

  const [newItem, setNewItem] = useState({ title: '', description: '', customFields: {} });
  const [submitErr, setSubmitErr] = useState('');
  const queryClient = useQueryClient();

  const addItemReq = async (payload) => {
    if (!canCreateItems()) throw new Error('Item creation endpoint is not configured');
    return createItemRequest(id, payload, axios);
  };
  const addItemMutation = useMutation(addItemReq, {
    onSuccess: () => {
      setNewItem({ title: '', description: '', customFields: {} });
      setSubmitErr('');
      refetchItems();
      queryClient.invalidateQueries(['inventory', id]);
    },
    onError: (e) => {
      setSubmitErr(e?.response?.data?.message || e?.message || 'Failed to add item');
    }
  });

  // Note: Do NOT early-return before hooks below; checks moved further down

  const inv = data || {};
  const createdAt = inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '';
  const items = embeddedItems ?? (Array.isArray(itemsData) ? itemsData : []);
  const itemCount = inv.itemCount ?? inv.itemsCount ?? items.length ?? 0;
  const nextIdPreview = previewCustomId(inv.customIdFormat || [], itemCount);

  // Normalize custom field definitions into a simple list of { key, type, label, required }
  const fieldDefs = (() => {
    const defs = [];
    const cf = inv.customFields || {};
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
    push(cf.singleLineText, 'string');
    push(cf.multiLineText, 'text');
    push(cf.numeric, 'number');
    push(cf.boolean, 'boolean');
    push(cf.documentImage, 'file');
    return defs;
  })();

  // Determine first image/file custom field key (if any)
  const imageFieldKey = (fieldDefs.find((f) => f.type === 'file') || null)?.key || null;

  // Tabs state
  const TABS = ['Items', 'Chat', 'Settings', 'Custom ID', 'Fields', 'Access', 'Stats', 'Export'];
  const [activeTab, setActiveTab] = useState('Items');

  // Column visibility (persist per-inventory)
  const storageKey = `inv:${id}:visibleCols`;
  const defaultVisible = React.useMemo(() => {
    const base = {
      title: true,
      image: !!imageFieldKey,
      customId: true,
      createdAt: true,
    };
    for (const f of fieldDefs) base[`cf:${f.key}`] = false; // default hidden
    return base;
  }, [imageFieldKey, fieldDefs]);

  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...defaultVisible, ...JSON.parse(raw) };
    } catch {}
    return defaultVisible;
  });
  React.useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(visibleCols)); } catch {}
  }, [storageKey, visibleCols]);

  // Column model
  const columns = React.useMemo(() => {
    const base = [
      {
        key: 'title',
        label: 'Title',
        render: (it) => (
          <Link to={`/items/${it.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{it.title || it.name || it.customId}</Link>
        ),
      },
      imageFieldKey && {
        key: 'image',
        label: 'Image',
        className: 'w-20',
        render: (it) => (
          it.customFields?.[imageFieldKey] ? (
            <img
              src={it.customFields[imageFieldKey]}
              alt={it.title || it.name || it.customId}
              className="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700" />
          )
        ),
      },
      { key: 'customId', label: 'ID', render: (it) => it.customId || it.serial || it.id },
      { key: 'createdAt', label: 'Created', render: (it) => (it.createdAt ? new Date(it.createdAt).toLocaleString() : '') },
    ].filter(Boolean);

    // append custom fields
    for (const f of fieldDefs) {
      base.push({
        key: `cf:${f.key}`,
        label: f.label,
        render: (it) => {
          const v = it.customFields?.[f.key];
          if (v == null) return '';
          if (f.type === 'boolean') return v ? 'Yes' : 'No';
          if (f.type === 'file') {
            return typeof v === 'string' ? (
              <a href={v} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">View</a>
            ) : '';
          }
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        },
      });
    }
    return base;
  }, [fieldDefs, imageFieldKey]);

  const shownColumns = columns.filter((c) => visibleCols[c.key] !== false);

  // Upload helper for quick-add form
  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post('/api/items/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.secure_url || res.data?.url;
  };

  // Safe place for loading/error checks (after all hooks)
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-600 dark:text-red-400 mb-2">Failed to load inventory.</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{error?.response?.data?.message || error?.message}</p>
        <div className="mt-4">
          <Link to="/inventories" className="text-blue-600 dark:text-blue-400 hover:underline">Back to list</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {(() => {
          const cover = inv.image || inv.imageUrl || inv.coverImage || inv.cover;
          return cover ? (
            <img src={cover} alt={inv.title} className="w-full h-64 object-cover" />
          ) : null;
        })()}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{inv.title}</h1>
              {inv.description && (
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{inv.description}</p>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Package className="h-4 w-4" />
              <span>{itemCount} items</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Calendar className="h-4 w-4" />
              <span>Created {createdAt}</span>
            </div>
            {inv.category && (
              <div className="text-gray-600 dark:text-gray-300">
                <span className="font-medium">Category:</span> {inv.category.name}
              </div>
            )}
            {inv.creator && (
              <div className="text-gray-600 dark:text-gray-300">
                <span className="font-medium">Owner:</span>{' '}
                <Link to={`/users/${inv.creator.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {inv.creator.firstName || inv.creator.username}
                </Link>
              </div>
            )}
            {Array.isArray(inv.customIdFormat) && inv.customIdFormat.length > 0 && (
              <div className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Next ID:</span> <span className="font-mono">{nextIdPreview}</span>
              </div>
            )}
          </div>

          {Array.isArray(inv.tags) && inv.tags.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                <Tag className="h-4 w-4" />
                <span className="font-medium">Tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {inv.tags.map((t) => (
                  <Link
                    key={t.id || t}
                    to={`/search?q=${encodeURIComponent(t.name || t)}`}
                    className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    {t.name || t}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mt-8 border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={`${activeTab === t ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'} whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium`}
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>

          {/* Items Section */}
          {activeTab === 'Items' && (
            <div className="mt-6">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Columns</h3>
                <div className="flex flex-wrap gap-4">
                  {columns.map((c) => (
                    <label key={c.key} className="inline-flex items-center gap-2 text-xs text-gray-800 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={visibleCols[c.key] !== false}
                        onChange={(e) => setVisibleCols((v) => ({ ...v, [c.key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>

              {embeddedItems === null && canListItems() && itemsLoading ? (
                <LoadingSpinner />
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">No items yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {shownColumns.map((c) => (
                          <th key={c.key} className={`px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${c.className || ''}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          {shownColumns.map((c) => (
                            <td key={c.key} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {typeof c.render === 'function' ? c.render(it) : it[c.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Placeholder content for other tabs */}
          {activeTab !== 'Items' && (
            <div className="mt-6 text-sm text-gray-700 dark:text-gray-300">
              {activeTab === 'Custom ID' && (
                <div>
                  <p className="mb-2">Example next ID:</p>
                  <p className="font-mono bg-gray-50 dark:bg-gray-900 inline-block px-2 py-1 rounded">{nextIdPreview}</p>
                  <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">A full custom ID builder UI can be added here.</p>
                </div>
              )}
              {activeTab !== 'Custom ID' && <p>Coming soon: {activeTab}</p>}
            </div>
          )}

          {/* Quick Add Item */}
          {canCreateItems() && (
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Add Item</h3>
            {submitErr && <p className="mb-2 text-red-600 dark:text-red-400">{submitErr}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Title"
                value={newItem.title}
                onChange={(e) => setNewItem((x) => ({ ...x, title: e.target.value }))}
                className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
              />
              <input
                placeholder="Description (optional)"
                value={newItem.description}
                onChange={(e) => setNewItem((x) => ({ ...x, description: e.target.value }))}
                className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
              />
            </div>
            {fieldDefs.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fieldDefs.map((f) => {
                  const val = newItem.customFields?.[f.key] ?? '';
                  const setVal = (v) => setNewItem((x) => ({ ...x, customFields: { ...(x.customFields || {}), [f.key]: v } }));
                  if (f.type === 'boolean') {
                    return (
                      <label key={f.key} className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => setVal(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                        />
                        {f.label}
                      </label>
                    );
                  }
                  if (f.type === 'text') {
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{f.label}</label>
                        <textarea
                          value={val}
                          onChange={(e) => setVal(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
                        />
                      </div>
                    );
                  }
                  if (f.type === 'number') {
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{f.label}</label>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => setVal(e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
                        />
                      </div>
                    );
                  }
                  if (f.type === 'file') {
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{f.label}</label>
                        {val && typeof val === 'string' && (
                          <div className="flex items-center gap-3 mb-2">
                            <div className="relative">
                              <img src={val} alt={f.label} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-700" />
                              <span
                                onClick={() => { setVal(''); setFileKeys((k) => ({ ...k, [f.key]: (k[f.key] || 0) + 1 })); }}
                                title="Remove"
                                aria-label="Remove"
                                className="absolute -top-1 -right-1 cursor-pointer select-none text-white text-sm leading-none"
                              >
                                ×
                              </span>
                            </div>
                            <a href={val} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">View</a>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          key={`qa-file-${f.key}-${fileKeys[f.key] || 0}`}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const url = await uploadFile(file);
                              setVal(url);
                            } catch (err) {
                              // eslint-disable-next-line no-alert
                              alert(err?.response?.data?.message || err.message || 'Upload failed');
                            }
                          }}
                          className="block w-full text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                      </div>
                    );
                  }
                  // default string input
                  return (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{f.label}</label>
                      <input
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              disabled={!newItem.title || addItemMutation.isLoading}
              onClick={() => addItemMutation.mutate({ title: newItem.title, description: newItem.description, customFields: newItem.customFields })}
              className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-md"
            >
              {addItemMutation.isLoading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
          )}

          <div className="mt-8">
            <Link to="/inventories" className="text-blue-600 dark:text-blue-400 hover:underline">Back to list</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
