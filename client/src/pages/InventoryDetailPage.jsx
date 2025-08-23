import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { getItemsListRequest, createItemRequest, canListItems, canCreateItems } from '../api/endpoints';
import { Calendar, Package, Tag, Eye, Pencil, Trash } from 'lucide-react';
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
  const navigate = useNavigate();

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

  // Upload helpers
  const uploadItemImage = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const r = await axios.post('/api/items/upload', fd);
    const url = r?.data?.url || r?.data?.secure_url || r?.data?.imageUrl || '';
    if (!url) throw new Error('Upload failed');
    return url;
  };
  const uploadInventoryCover = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const r = await axios.post('/api/inventories/upload', fd);
    const url = r?.data?.url || r?.data?.secure_url || r?.data?.imageUrl || '';
    if (!url) throw new Error('Upload failed');
    return url;
  };

  // Inventory update mutation (uses PUT with FormData to match server contract)
  const updateInventory = async (payload) => {
    const fd = new FormData();
    if (payload.title !== undefined) fd.append('title', payload.title);
    if (payload.description !== undefined) fd.append('description', payload.description);
    if (payload.categoryId !== undefined) fd.append('categoryId', String(payload.categoryId));
    if (payload.isPublic !== undefined) fd.append('isPublic', String(!!payload.isPublic));
    if (payload.imageUrl !== undefined) fd.append('imageUrl', payload.imageUrl || '');
    if (payload.tags !== undefined) fd.append('tags', JSON.stringify(payload.tags));
    if (payload.customIdFormat !== undefined) fd.append('customIdFormat', JSON.stringify(payload.customIdFormat));
    if (payload.customFields !== undefined) fd.append('customFields', JSON.stringify(payload.customFields));
    const res = await axios.put(`/api/inventories/${id}`, fd);
    return res.data;
  };
  const updateInvMutation = useMutation(updateInventory, {
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory', id]);
    }
  });

  // Settings state (title/description/isPublic/imageUrl)
  const [settingsForm, setSettingsForm] = React.useState({ title: '', description: '', isPublic: true, imageUrl: '' });
  React.useEffect(() => {
    setSettingsForm({
      title: inv.title || '',
      description: inv.description || '',
      isPublic: !!(inv.isPublic ?? true),
      imageUrl: inv.image || inv.imageUrl || ''
    });
  }, [inv.title, inv.description, inv.isPublic, inv.image, inv.imageUrl]);

  // Custom ID builder state (initialized from inventory)
  const [cidFormat, setCidFormat] = React.useState([]);
  const [cidNewType, setCidNewType] = React.useState('text');
  React.useEffect(() => { setCidFormat(Array.isArray(inv.customIdFormat) ? inv.customIdFormat : []); }, [inv.customIdFormat]);

  // Custom Fields builder state (initialized from inventory)
  const [cfBuilder, setCfBuilder] = React.useState({ singleLineText: [], multiLineText: [], numeric: [], boolean: [], documentImage: [] });
  const [cfNewType, setCfNewType] = React.useState('singleLineText');
  const [cfNewName, setCfNewName] = React.useState('');
  React.useEffect(() => {
    const cf = inv.customFields || {};
    setCfBuilder({
      singleLineText: cf.singleLineText || [],
      multiLineText: cf.multiLineText || [],
      numeric: cf.numeric || [],
      boolean: cf.boolean || [],
      documentImage: cf.documentImage || [],
    });
  }, [inv.customFields]);

  // Chat
  const { data: chatData, refetch: refetchChat } = useQuery(
    ['inventory:chat', id],
    async () => {
      try {
        const r = await axios.get(`/api/comments/inventory/${id}`);
        return Array.isArray(r.data?.comments) ? r.data.comments : [];
      } catch {
        return [];
      }
    },
    { enabled: !!id }
  );
  const [message, setMessage] = React.useState('');
  const addCommentMutation = useMutation(
    async (text) => {
      const r = await axios.post(`/api/comments`, { inventoryId: id, content: text });
      return r.data;
    },
    { onSuccess: () => { setMessage(''); refetchChat(); } }
  );

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
      // If we already show a dedicated thumbnail Image column, skip duplicate file columns likely labeled as Image
      if (imageFieldKey && f.type === 'file') {
        const lbl = String(f.label || '').toLowerCase();
        if (lbl === 'image' || lbl.includes('image')) continue;
      }
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

  // Selection and toolbar actions
  const [selected, setSelected] = useState(() => new Set());
  const isSelected = (id) => selected.has(id);
  const toggleSelect = (id) => setSelected((s) => {
    const ns = new Set(s);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    return ns;
  });
  const clearSelection = () => setSelected(new Set());
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleSelectAll = () => setSelected((s) => s.size === items.length ? new Set() : new Set(items.map((it) => it.id)));

  // Per-row actions
  const deleteMutation = useMutation(
    async (itemId) => {
      await axios.delete(`/api/items/${itemId}`);
      return itemId;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['inventory:items', id]);
        queryClient.invalidateQueries(['inventory', id]);
      },
    }
  );

  const openFirstSelected = (mode) => {
    const first = Array.from(selected)[0];
    if (!first) return;
    if (mode === 'view') navigate(`/items/${first}`);
    else if (mode === 'edit') navigate(`/items/${first}?edit=1`);
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected item(s)?`)) return;
    for (const idToDel of ids) {
      try {
        if (typeof deleteMutation.mutateAsync === 'function') {
          await deleteMutation.mutateAsync(idToDel);
        } else {
          await axios.delete(`/api/items/${idToDel}`);
        }
      } catch (e) {
        // continue others
      }
    }
    clearSelection();
    queryClient.invalidateQueries(['inventory:items', id]);
    queryClient.invalidateQueries(['inventory', id]);
  };

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
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                <span className="font-medium">Owner:</span>
                {(() => {
                  const name = (inv.creator.firstName && inv.creator.lastName)
                    ? `${inv.creator.firstName} ${inv.creator.lastName}`
                    : (inv.creator.firstName || inv.creator.username || 'User');
                  const avatar = inv.creator.avatar || inv.creator.avatarUrl || '';
                  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
                  return (
                    <>
                      <img
                        src={avatar || fallback}
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.src = fallback; }}
                        alt={name}
                        className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      />
                      <Link to={`/profile/${inv.creator.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {name}
                      </Link>
                    </>
                  );
                })()}
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

          <div className="mt-8 border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex w-full justify-between gap-4 overflow-x-auto" aria-label="Tabs" role="tablist">
              {TABS.map((t) => (
                <a
                  key={t}
                  href="#"
                  role="tab"
                  aria-selected={activeTab === t}
                  onClick={(e) => { e.preventDefault(); setActiveTab(t); }}
                  className={`inline-block whitespace-nowrap select-none px-0 pb-2 text-sm font-normal cursor-pointer
                    appearance-none bg-transparent rounded-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 hover:bg-transparent active:bg-transparent
                    ${activeTab === t
                      ? 'border-b-2 border-blue-600 text-gray-900 dark:text-gray-100'
                      : 'border-b-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}
                >
                  {t}
                </a>
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
                  {/* Selection toolbar with icon-only actions */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-sm">
                      {/* <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                        />
                        <span className="text-gray-700 dark:text-gray-300">Select all</span>
                      </label>
                      <span className="text-gray-500 dark:text-gray-400">{selected.size} selected</span> */}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFirstSelected('view')}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
                        title="View selected"
                        aria-label="View selected"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openFirstSelected('edit')}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
                        title="Edit selected"
                        aria-label="Edit selected"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelected}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-red-600 text-white disabled:opacity-50 hover:bg-red-700"
                        title="Delete selected"
                        aria-label="Delete selected"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Clear selection"
                        aria-label="Clear selection"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            aria-label="Select all rows"
                          />
                        </th>
                        {shownColumns.map((c) => (
                          <th key={c.key} className={`px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${c.className || ''}`}>{c.label}</th>
                        ))}
                        {/* No per-row Actions column; actions are in the toolbar */}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                              checked={isSelected(it.id)}
                              onChange={() => toggleSelect(it.id)}
                              aria-label={`Select ${it.title || it.name || it.customId}`}
                            />
                          </td>
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

          {/* Other Tabs Content */}
          {activeTab === 'Chat' && (
            <div className="mt-6">
              <div className="space-y-3 max-h-72 overflow-auto bg-gray-50 dark:bg-gray-900 p-3 rounded">
                {(chatData || []).map((c, i) => (
                  <div key={c.id || i} className="text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {(() => {
                          const a = c.author || {};
                          const fn = a.firstName || '';
                          const ln = a.lastName || '';
                          const full = fn && ln ? `${fn} ${ln}` : (fn || a.username || 'User');
                          return full;
                        })()}
                      </span>
                      <span className="text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
                    </div>
                    <div className="text-gray-800 dark:text-gray-100">{c.content || ''}</div>
                  </div>
                ))}
                {(chatData || []).length === 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">No messages yet.</div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => message.trim() && addCommentMutation.mutate(message.trim())}
                  disabled={!message.trim() || addCommentMutation.isLoading}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}
          {activeTab === 'Settings' && (
            <div className="mt-6 space-y-3">
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input value={settingsForm.title} onChange={(e)=>setSettingsForm((f)=>({...f,title:e.target.value}))} className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea rows={3} value={settingsForm.description} onChange={(e)=>setSettingsForm((f)=>({...f,description:e.target.value}))} className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2" />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <input type="checkbox" checked={settingsForm.isPublic} onChange={(e)=>setSettingsForm((f)=>({...f,isPublic:e.target.checked}))} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600" />
                Public inventory
              </label>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Cover image URL</label>
                <input value={settingsForm.imageUrl} onChange={(e)=>setSettingsForm((f)=>({...f,imageUrl:e.target.value}))} className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Upload cover</label>
                <input type="file" accept="image/*" onChange={async (e)=>{ const file=e.target.files?.[0]; if(!file) return; try{ const url=await uploadInventoryCover(file); setSettingsForm((f)=>({...f,imageUrl:url})); }catch(err){ alert(err?.response?.data?.message||err.message||'Upload failed'); } }} />
              </div>
              <button
                type="button"
                onClick={()=>updateInvMutation.mutate({ title: settingsForm.title, description: settingsForm.description, isPublic: settingsForm.isPublic, imageUrl: settingsForm.imageUrl })}
                disabled={updateInvMutation.isLoading}
                className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50"
              >
                {updateInvMutation.isLoading ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          )}

          {activeTab === 'Custom ID' && (
            <div className="mt-6">
              {cidFormat.length > 0 && (
                <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                  Example: <span className="font-mono">{previewCustomId(cidFormat, itemCount)}</span>
                </div>
              )}
              <div className="space-y-2">
                {cidFormat.map((el, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-32 text-xs uppercase text-gray-500 dark:text-gray-400">{el.type}</span>
                    {(el.type === 'text' || el.type === 'fixed') && (
                      <input value={el.value || ''} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,value:e.target.value}; setCidFormat(next); }} className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
                    )}
                    {el.type === 'sequence' && (
                      <input type="number" min={0} value={el.padding ?? 0} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,padding:Number(e.target.value||0)}; setCidFormat(next); }} className="w-24 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
                    )}
                    {el.type === 'datetime' && (
                      <input value={el.format || 'YYYYMMDD'} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,format:e.target.value}; setCidFormat(next); }} placeholder="YYYYMMDD or YYYY-MM-DD" className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
                    )}
                    <div className="flex items-center gap-1">
                      <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600" disabled={idx===0} onClick={()=>{ const n=[...cidFormat]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; setCidFormat(n); }}>↑</button>
                      <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600" disabled={idx===cidFormat.length-1} onClick={()=>{ const n=[...cidFormat]; [n[idx+1],n[idx]]=[n[idx],n[idx+1]]; setCidFormat(n); }}>↓</button>
                      <button type="button" className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300" onClick={()=>setCidFormat(cidFormat.filter((_,i)=>i!==idx))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={cidNewType} onChange={(e)=>setCidNewType(e.target.value)} className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1">
                  <option value="text">Fixed</option>
                  <option value="random20">20-bit random (X5)</option>
                  <option value="random32">32-bit random (X8)</option>
                  <option value="random6">Random 6-digit</option>
                  <option value="random9">Random 9-digit</option>
                  <option value="guid">GUID</option>
                  <option value="datetime">Date/time</option>
                  <option value="sequence">Sequence</option>
                </select>
                <button type="button" className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600" onClick={()=>{
                  const t=cidNewType; const el={ type:t };
                  if (t==='text') el.value=''; if (t==='sequence') el.padding=3; if (t==='datetime') el.format='YYYYMMDD';
                  setCidFormat((arr)=>[...arr, el]);
                }}>Add element</button>
                <button type="button" className="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white" disabled={updateInvMutation.isLoading} onClick={()=>updateInvMutation.mutate({ customIdFormat: cidFormat })}>
                  {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Fields' && (
            <div className="mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['singleLineText','multiLineText','numeric','boolean','documentImage'].map((k)=> (
                  <div key={k}>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{k}</h4>
                    <ul className="mb-1 list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
                      {(cfBuilder[k]||[]).map((n,idx)=>(
                        <li key={`${k}-${idx}`} className="flex items-center justify-between">
                          <span>{n}</span>
                          <button type="button" className="text-xs text-red-600" onClick={()=> setCfBuilder((b)=>({ ...b, [k]: b[k].filter((_,i)=>i!==idx) }))}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={cfNewType} onChange={(e)=>setCfNewType(e.target.value)} className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1">
                  <option value="singleLineText">Single line</option>
                  <option value="multiLineText">Multi line</option>
                  <option value="numeric">Numeric</option>
                  <option value="boolean">Boolean</option>
                  <option value="documentImage">Document/Image</option>
                </select>
                <input value={cfNewName} onChange={(e)=>setCfNewName(e.target.value)} placeholder="Field name" className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
                <button type="button" className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600" onClick={()=>{ const name=cfNewName.trim(); if(!name) return; setCfBuilder((b)=> ({ ...b, [cfNewType]: [ ...(b[cfNewType]||[]), name ] })); setCfNewName(''); }}>Add field</button>
                <button type="button" className="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white" disabled={updateInvMutation.isLoading} onClick={()=>updateInvMutation.mutate({ customFields: cfBuilder })}>
                  {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Access' && (
            <div className="mt-6 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <input type="checkbox" checked={settingsForm.isPublic} onChange={(e)=>setSettingsForm((f)=>({...f,isPublic:e.target.checked}))} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600" />
                Public inventory
              </label>
              <button type="button" className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50" onClick={()=>updateInvMutation.mutate({ isPublic: settingsForm.isPublic })} disabled={updateInvMutation.isLoading}>
                {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
              </button>
              <p className="text-xs text-gray-600 dark:text-gray-400">Collaborators management can be added here when API is available.</p>
            </div>
          )}

          {activeTab === 'Stats' && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded bg-gray-50 dark:bg-gray-900">
                <div className="text-gray-500 dark:text-gray-400">Items</div>
                <div className="text-lg text-gray-900 dark:text-gray-100">{itemCount}</div>
              </div>
              <div className="p-3 rounded bg-gray-50 dark:bg-gray-900">
                <div className="text-gray-500 dark:text-gray-400">Created</div>
                <div className="text-lg text-gray-900 dark:text-gray-100">{createdAt}</div>
              </div>
              {Array.isArray(inv.tags) && (
                <div className="p-3 rounded bg-gray-50 dark:bg-gray-900 col-span-2">
                  <div className="text-gray-500 dark:text-gray-400 mb-1">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {inv.tags.map((t)=> (<span key={t.id||t} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">{t.name || t}</span>))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Export' && (
            <div className="mt-6">
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-blue-600 text-white"
                onClick={() => {
                  const headers = shownColumns.map((c)=>c.label);
                  const rows = items.map((it)=> shownColumns.map((c)=> {
                    const v = typeof c.render === 'function' ? (it[c.key] ?? '') : it[c.key];
                    return String(v ?? '').replaceAll('"','\"');
                  }));
                  const csv = [headers, ...rows].map(r=> r.map(x=>`"${x}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `${inv.title || 'inventory'}-items.csv`; a.click(); URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>
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
