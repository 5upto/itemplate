import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/UI/LoadingSpinner';

export default function CreateInventoryPage() {
  // If your backend expects a different field name (e.g., 'file', 'cover', 'coverImage'),
  // change this constant to match. Using multiple file fields can cause 'Unexpected field'.
  const IMAGE_FILE_FIELD = 'image';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: '',
    description: '',
    categoryId: '',
    tags: '', // comma separated input, but we also support autocomplete chips below
    isPublic: true,
    imageUrl: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [coverFileKey, setCoverFileKey] = useState(0); // force-remount input to clear filename
  const [previewUrl, setPreviewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagOptions, setTagOptions] = useState([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagDropdownRef = useRef(null);
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    // Initialize selectedTags from form.tags if present
    const initial = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    setSelectedTags(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Custom ID Builder State ----
  const [customIdFormat, setCustomIdFormat] = useState([]);
  const [newIdElType, setNewIdElType] = useState('text');
  const [newIdElValue, setNewIdElValue] = useState(''); // for text
  const [newIdElPadding, setNewIdElPadding] = useState(3); // for sequence
  const [newIdElDatetimeFmt, setNewIdElDatetimeFmt] = useState('YYYYMMDD'); // datetime

  // ---- Custom Fields Builder State ----
  const [customFields, setCustomFields] = useState({
    singleLineText: [],
    multiLineText: [],
    numeric: [],
    documentImage: [],
    boolean: []
  });
  const [newFieldType, setNewFieldType] = useState('singleLineText');
  const [newFieldName, setNewFieldName] = useState('');

  const addCustomField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    setCustomFields((cf) => {
      const current = Array.isArray(cf[newFieldType]) ? cf[newFieldType] : [];
      if (current.includes(name)) return cf; // avoid duplicates
      return { ...cf, [newFieldType]: [...current, name] };
    });
    setNewFieldName('');
  };

  // Utility: preview next ID (kept in sync with InventoryDetailPage preview)
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
          const yyyy = String(now.getFullYear());
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          out += f === 'YYYY-MM-DD' ? `${yyyy}-${mm}-${dd}` : `${yyyy}${mm}${dd}`;
          break;
        }
        case 'sequence': {
          const n = String((0) + 1); // preview uses starting sequence
          const padding = parseInt(el?.padding || 0, 10);
          out += padding > 0 ? n.padStart(padding, '0') : n;
          break;
        }
        default:
          break;
      }
    }
    return out;
  };

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  // Tag autocomplete: fetch suggestions while typing
  useEffect(() => {
    let active = true;
    const q = tagQuery.trim();
    if (!q) {
      setTagOptions([]);
      return;
    }
    const fetchTags = async () => {
      try {
        const res = await axios.get('/api/tags', { params: { q } });
        if (!active) return;
        const options = Array.isArray(res.data) ? res.data : res.data?.tags || [];
        setTagOptions(options);
      } catch (e) {
        setTagOptions([]);
      }
    };
    const timer = setTimeout(fetchTags, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tagQuery]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const addTag = (tag) => {
    const current = selectedTags;
    if (!current.includes(tag)) setSelectedTags([...current, tag]);
    setTagQuery('');
    setShowTagDropdown(false);
  };

  const removeTag = (idx) => {
    setSelectedTags((arr) => arr.filter((_, i) => i !== idx));
  };

  const onTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagQuery.trim().replace(/,$/, '');
      if (val) addTag(val);
    } else if (e.key === 'Backspace' && !tagQuery) {
      // Remove last chip when input is empty
      setSelectedTags((arr) => arr.slice(0, -1));
    }
  };

  // Upload helper (same as items flow): send to /api/items/upload and store returned URL
  const uploadCover = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    const res = await axios.post('/api/inventories/upload', fd);
    const url = res?.data?.url || res?.data?.secure_url || res?.data?.imageUrl || '';
    if (!url) throw new Error('Upload failed');
    return url;
  };

  // Select image: immediately upload and store URL (like items image field)
  const onSelectImage = async (file) => {
    if (!file) { setImageFile(null); return; }
    if (!file.type?.startsWith('image/')) {
      setError('Please select a valid image file.');
      setImageFile(null);
      return;
    }
    try {
      setError('');
      setImageFile(file);
      const url = await uploadCover(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      setPreviewUrl(url);
      // Do not reset the file input here so the filename remains visible like items UI
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Failed to upload image');
    }
  };

  // Keep preview in sync with stored URL
  useEffect(() => {
    setPreviewUrl(form.imageUrl || '');
  }, [form.imageUrl]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const fd = new FormData();
      fd.append('title', form.title);
      if (form.description) fd.append('description', form.description);
      if (form.categoryId) fd.append('categoryId', form.categoryId);
      fd.append('isPublic', String(!!form.isPublic));
      // Serialize tags as JSON array of strings to match server expectation
      fd.append('tags', JSON.stringify(selectedTags));
      // Send builder outputs
      fd.append('customIdFormat', JSON.stringify(customIdFormat));
      fd.append('customFields', JSON.stringify(customFields));
      if (imageFile) {
        fd.append(IMAGE_FILE_FIELD, imageFile);
      } else if (form.imageUrl) {
        fd.append('imageUrl', form.imageUrl);
      }

      // Do NOT set Content-Type manually; let the browser add the multipart boundary
      const res = await axios.post('/api/inventories', fd);

      const created = res.data;
      const id = created?.id || created?.inventory?.id;
      if (id) {
        navigate(`/inventories/${id}`);
      } else {
        navigate('/inventories');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to create inventory';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h1 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-gray-100">{t('inventory.create')}</h1>
      {error && (
        <div className="mb-4 text-red-600 dark:text-red-400" role="alert">{error}</div>
      )}
      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('fields.title')}</label>
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            required
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            rows={4}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category ID (optional)</label>
          <input
            name="categoryId"
            value={form.categoryId}
            onChange={onChange}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div ref={tagDropdownRef} className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
          <div className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 flex flex-wrap items-center gap-1 focus-within:ring-2 focus-within:ring-blue-500">
            {selectedTags.map((tag, idx) => (
              <span key={`${tag}-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-600 text-xs text-gray-800 dark:text-gray-100">
                {tag}
                <button type="button" className="text-gray-500 hover:text-red-600" onClick={() => removeTag(idx)}>×</button>
              </span>
            ))}
            <input
              value={tagQuery}
              onChange={(e) => { setTagQuery(e.target.value); setShowTagDropdown(true); }}
              onKeyDown={onTagKeyDown}
              placeholder="e.g. books, tech"
              className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 px-1 py-1"
            />
          </div>
          {showTagDropdown && tagOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow max-h-48 overflow-auto">
              {tagOptions.map((opt) => {
                const val = opt.name || opt;
                return (
                  <li
                    key={val}
                    className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => addTag(val)}
                  >
                    {val}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isPublic"
            type="checkbox"
            name="isPublic"
            checked={form.isPublic}
            onChange={onChange}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">{t('access.public')}</label>
        </div>

        {/* Custom ID Builder */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Custom ID</h2>
          {customIdFormat.length > 0 && (
            <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
              Example: <span className="font-mono">{previewCustomId(customIdFormat)}</span>
            </div>
          )}
          <div className="space-y-2">
            {customIdFormat.map((el, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-32 text-xs uppercase text-gray-500 dark:text-gray-400">{el.type}</span>
                {el.type === 'text' || el.type === 'fixed' ? (
                  <input
                    value={el.value || ''}
                    onChange={(e) => {
                      const next = [...customIdFormat]; next[idx] = { ...el, value: e.target.value }; setCustomIdFormat(next);
                    }}
                    className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1"
                  />
                ) : el.type === 'sequence' ? (
                  <input
                    type="number"
                    min={0}
                    value={el.padding ?? 0}
                    onChange={(e) => {
                      const next = [...customIdFormat]; next[idx] = { ...el, padding: Number(e.target.value || 0) }; setCustomIdFormat(next);
                    }}
                    className="w-24 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1"
                  />
                ) : el.type === 'datetime' ? (
                  <input
                    value={el.format || 'YYYYMMDD'}
                    onChange={(e) => {
                      const next = [...customIdFormat]; next[idx] = { ...el, format: e.target.value }; setCustomIdFormat(next);
                    }}
                    placeholder="YYYYMMDD or YYYY-MM-DD"
                    className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1"
                  />
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">auto</div>
                )}
                <div className="flex items-center gap-1">
                  <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600" disabled={idx===0}
                    onClick={() => { const next=[...customIdFormat]; [next[idx-1],next[idx]]=[next[idx],next[idx-1]]; setCustomIdFormat(next); }}>↑</button>
                  <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600" disabled={idx===customIdFormat.length-1}
                    onClick={() => { const next=[...customIdFormat]; [next[idx+1],next[idx]]=[next[idx],next[idx+1]]; setCustomIdFormat(next); }}>↓</button>
                  <button type="button" className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300"
                    onClick={() => setCustomIdFormat(customIdFormat.filter((_,i)=>i!==idx))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={newIdElType} onChange={(e)=>setNewIdElType(e.target.value)}
              className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1">
              <option value="text">Fixed</option>
              <option value="random20">20-bit random (X5)</option>
              <option value="random32">32-bit random (X8)</option>
              <option value="random6">Random 6 digits</option>
              <option value="random9">Random 9 digits</option>
              <option value="sequence">Sequence</option>
              <option value="datetime">Date/time</option>
              <option value="guid">GUID</option>
            </select>
            {(newIdElType === 'text') && (
              <input value={newIdElValue} onChange={(e)=>setNewIdElValue(e.target.value)} placeholder="e.g. INV_"
                     className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
            )}
            {newIdElType === 'sequence' && (
              <input type="number" min={0} value={newIdElPadding} onChange={(e)=>setNewIdElPadding(Number(e.target.value||0))}
                     className="w-28 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
            )}
            {newIdElType === 'datetime' && (
              <input value={newIdElDatetimeFmt} onChange={(e)=>setNewIdElDatetimeFmt(e.target.value)} placeholder="YYYYMMDD"
                     className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1" />
            )}
            <button type="button" className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-sm"
              onClick={() => {
                const el = (() => {
                  if (newIdElType === 'text') return { type: 'text', value: newIdElValue };
                  if (newIdElType === 'sequence') return { type: 'sequence', padding: newIdElPadding };
                  if (newIdElType === 'datetime') return { type: 'datetime', format: newIdElDatetimeFmt };
                  return { type: newIdElType };
                })();
                setCustomIdFormat((arr) => [...arr, el]);
                setNewIdElValue('');
              }}>Add element</button>
          </div>
        </div>

        {/* Custom Fields Builder */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Custom fields</h2>
          <div className="space-y-1 mb-2">
            {['singleLineText','multiLineText','numeric','boolean','documentImage'].map((group) => (
              Array.isArray(customFields[group]) && customFields[group].length > 0 ? (
                <div key={group}>
                  <div className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">{group}</div>
                  <div className="flex flex-wrap gap-2">
                    {customFields[group].map((name, i) => (
                      <span key={`${group}-${name}-${i}`} className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-800 dark:text-gray-100">
                        {name}
                        <button type="button" className="text-red-600 dark:text-red-400"
                          onClick={() => setCustomFields((cf) => ({ ...cf, [group]: cf[group].filter((n, idx) => !(idx===i)) }))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={newFieldType} onChange={(e)=>setNewFieldType(e.target.value)}
                    className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1">
              <option value="singleLineText">Single line text</option>
              <option value="multiLineText">Multi line text</option>
              <option value="numeric">Number</option>
              <option value="boolean">Boolean</option>
              <option value="documentImage">Document/Image</option>
            </select>
            <input
              value={newFieldName}
              onChange={(e)=>setNewFieldName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
              placeholder="Field name"
              className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1"
            />
            <button
              type="button"
              className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-sm disabled:opacity-60"
              disabled={!newFieldName.trim()}
              onClick={addCustomField}
            >
              Add field
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cover Image (optional)</label>
          {previewUrl && (
            <div className="flex items-center gap-3 mb-2">
              <div className="relative">
                <img src={previewUrl} alt="cover" className="w-20 h-20 object-cover rounded border border-gray-200 dark:border-gray-700" />
                <span
                  onClick={() => { setForm((f)=>({ ...f, imageUrl: '' })); setImageFile(null); setCoverFileKey((k)=>k+1); }}
                  title="Remove"
                  aria-label="Remove"
                  className="absolute -top-1 -right-1 cursor-pointer select-none text-white text-sm leading-none"
                >
                  ×
                </span>
              </div>
              <a href={previewUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">View</a>
            </div>
          )}
          <div className="space-y-2">
            <div>
              <input
                type="file"
                accept="image/*"
                key={`cover-${coverFileKey}`}
                onChange={(e) => onSelectImage(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>
        </div>
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-md"
          >
            {submitting ? <LoadingSpinner size="sm" /> : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
