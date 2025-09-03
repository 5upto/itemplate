import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import { getItemsListRequest, createItemRequest, canListItems, canCreateItems } from '../api/endpoints';
import { Calendar, Package, Tag, Eye, Pencil, Trash, Check, X } from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { io } from 'socket.io-client';
import DeleteModal from '../components/UI/DeleteModal';

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
  // All hooks must be called unconditionally at the top level
  const { id } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // State hooks
  const [fileKeys, setFileKeys] = React.useState({});
  const [newItem, setNewItem] = useState({
    string1: '', string2: '', string3: '',
    int1: '', int2: '', int3: '',
    bool1: false, bool2: false, bool3: false,
  });
  const [submitErr, setSubmitErr] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const socketRef = React.useRef(null);
  const [unread, setUnread] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  // Delete modals state
  const [showDeleteItemsModal, setShowDeleteItemsModal] = useState(false);
  const [pendingItemIds, setPendingItemIds] = useState([]);
  const [isDeletingItems, setIsDeletingItems] = useState(false);
  const [showDeleteCommentModal, setShowDeleteCommentModal] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  
  // Data fetching
  const { data, isLoading, isError, error } = useQuery(
    ['inventory', id],
    () => axios.get(`/api/inventories/${id}`).then((r) => r.data),
    { enabled: !!id }
  );
  
  // Items list for this inventory
  const embeddedItems = Array.isArray(data?.items) ? data.items : null;
  const fetchItems = React.useCallback(async () => {
    if (!canListItems() || !id) return [];
    return getItemsListRequest(id, axios);
  }, [id]);
  
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery(
    ['inventory:items', id],
    fetchItems,
    { enabled: !!id && !embeddedItems && canListItems() }
  );
  
  // Memoized values
  const items = React.useMemo(() => {
    return embeddedItems || itemsData || [];
  }, [embeddedItems, itemsData]);
  
  const inv = React.useMemo(() => data || {}, [data]);
  const itemCount = items.length;
  const nextIdPreview = React.useMemo(() => 
    previewCustomId((data?.customIdFormat || []), itemCount), [data?.customIdFormat, itemCount]);
  const totalLikes = React.useMemo(() => {
    try {
      return items.reduce((acc, it) => acc + (Number(it?.likeCount) || 0), 0);
    } catch { return 0; }
  }, [items]);

  // 14-day activity series from item creation timestamps
  const activitySeries = React.useMemo(() => {
    const days = 14;
    const counts = Array(days).fill(0);
    const now = new Date();
    for (const it of items) {
      const ts = it?.createdAt ? new Date(it.createdAt) : null;
      if (!ts) continue;
      const diffDays = Math.floor((now - ts) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < days) counts[days - 1 - diffDays] += 1;
    }
    return counts;
  }, [items]);

  const spark = React.useMemo(() => {
    const w = 120, h = 28;
    const n = activitySeries.length || 1;
    const max = Math.max(1, ...activitySeries);
    const step = n > 1 ? (w / (n - 1)) : 0;
    const points = activitySeries.map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 2) - 1; // pad top/bottom by 1px
      return `${x},${y}`;
    });
    const d = `M ${points.join(' L ')}`;
    return { w, h, d, max };
  }, [activitySeries]);

  // Current user and role helpers
  const { data: me } = useQuery(['me'], () => axios.get('/api/auth/me').then(r => r.data));
  const currentUserId = me?.id;
  const isAdmin = !!me?.isAdmin;
  const isOwner = !!(currentUserId && inv?.creator?.id === currentUserId);
  const canManageInventory = isOwner || isAdmin;

  // Tabs state (some tabs only for owner/admin)
  const TABS = ['Items', 'Chat', 'Settings', 'Custom ID', 'Fields', 'Access', 'Stats', 'Export'];
  const [activeTab, setActiveTab] = useState('Items');

  const visibleTabs = React.useMemo(() => {
    const always = ['Items', 'Chat', 'Stats'];
    const managed = ['Settings', 'Custom ID', 'Fields', 'Access', 'Export'];
    return canManageInventory ? [...always.slice(0,2), ...managed, 'Stats'] : always;
  }, [canManageInventory]);

  React.useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0] || 'Items');
  }, [visibleTabs, activeTab]);

  React.useEffect(() => {
    if (activeTab === 'Chat') setUnread(0);
  }, [activeTab]);

  const addItemReq = async (payload) => {
    if (!canCreateItems()) throw new Error('Item creation endpoint is not configured');
    return createItemRequest(id, payload, axios);
  };
  const addItemMutation = useMutation(addItemReq, {
    onSuccess: () => {
      setNewItem({
        string1: '', string2: '', string3: '',
        int1: '', int2: '', int3: '',
        bool1: false, bool2: false, bool3: false,
      });
      setSubmitErr('');
      refetchItems();
      queryClient.invalidateQueries(['inventory', id]);
    },
    onError: (e) => {
      setSubmitErr(e?.response?.data?.message || e?.message || 'Failed to add item');
    }
  });

  // Note: Do NOT early-return before hooks below; checks moved further down

  const createdAt = inv.createdAt ? new Date(inv.createdAt).toLocaleString() : '';

  // Selection handlers (hooks must be before any early return)
  const isSelected = React.useCallback((id) => selected.has(id), [selected]);
  const toggleSelect = React.useCallback((id) => setSelected((s) => {
    const ns = new Set(s);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    return ns;
  }), []);
  const clearSelection = React.useCallback(() => setSelected(new Set()), []);
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleSelectAll = React.useCallback(() => {
    setSelected((s) => s.size === items.length ? new Set() : new Set(items.map((it) => it.id)));
  }, [items.length]);

  // Per-row actions - delete mutation
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

  const deleteSelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setPendingItemIds(ids);
    setShowDeleteItemsModal(true);
  };

  const handleConfirmDeleteItems = async () => {
    if (pendingItemIds.length === 0) return;
    try {
      setIsDeletingItems(true);
      for (const idToDel of pendingItemIds) {
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
    } finally {
      setIsDeletingItems(false);
      setPendingItemIds([]);
      setShowDeleteItemsModal(false);
    }
  };

  // Build fixed-slot column definitions from inventory template metadata
  const fixedSlotDefs = React.useMemo(() => {
    const defs = [];
    const push = (state, name, key, type) => {
      if (!state) return; // slot disabled
      defs.push({ key, type, label: name || key });
    };
    // Determine which string labels are image/document types
    const docSet = new Set(
      Array.isArray(inv?.customFields?.documentImage) ? inv.customFields.documentImage : []
    );
    const pushString = (state, name, key) => {
      if (!state) return;
      const base = { key, label: name || key };
      const type = (name && docSet.has(name)) ? 'file' : 'string';
      defs.push({ ...base, type });
    };
    pushString(inv.custom_string1_state, inv.custom_string1_name, 'string1');
    pushString(inv.custom_string2_state, inv.custom_string2_name, 'string2');
    pushString(inv.custom_string3_state, inv.custom_string3_name, 'string3');
    push(inv.custom_int1_state, inv.custom_int1_name, 'int1', 'number');
    push(inv.custom_int2_state, inv.custom_int2_name, 'int2', 'number');
    push(inv.custom_int3_state, inv.custom_int3_name, 'int3', 'number');
    push(inv.custom_bool1_state, inv.custom_bool1_name, 'bool1', 'boolean');
    push(inv.custom_bool2_state, inv.custom_bool2_name, 'bool2', 'boolean');
    push(inv.custom_bool3_state, inv.custom_bool3_name, 'bool3', 'boolean');
    return defs;
  }, [
    inv.custom_string1_state, inv.custom_string1_name,
    inv.custom_string2_state, inv.custom_string2_name,
    inv.custom_string3_state, inv.custom_string3_name,
    inv.custom_int1_state, inv.custom_int1_name,
    inv.custom_int2_state, inv.custom_int2_name,
    inv.custom_int3_state, inv.custom_int3_name,
    inv.custom_bool1_state, inv.custom_bool1_name,
    inv.custom_bool2_state, inv.custom_bool2_name,
    inv.custom_bool3_state, inv.custom_bool3_name,
    inv.customFields?.documentImage,
  ]);

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
  // Alias: generic file upload uses the item image uploader (returns URL)
  // const uploadFile = uploadItemImage;

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
  const [coverFileKey, setCoverFileKey] = React.useState(0);
  React.useEffect(() => {
    setSettingsForm({
      title: inv.title || '',
      description: inv.description || '',
      isPublic: !!(inv.isPublic ?? true),
      imageUrl: inv.image || inv.imageUrl || ''
    });
  }, [inv.title, inv.description, inv.isPublic, inv.image, inv.imageUrl]);

  // Access management state and mutations
  const [collabEmail, setCollabEmail] = React.useState(''); // populated from selected user
  const [collabWrite, setCollabWrite] = React.useState(true);
  const [userQuery, setUserQuery] = React.useState('');
  const [userResults, setUserResults] = React.useState([]);
  const [showUserDropdown, setShowUserDropdown] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState(null);

  // Debounced user search
  React.useEffect(() => {
    const q = userQuery.trim();
    if (!q || q.length < 2) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await axios.get(`/api/users/search/autocomplete`, { params: { q } });
        const raw = Array.isArray(r.data) ? r.data : [];
        const existing = new Set((inv.accessUsers || []).map(u => u.id));
        const ownerId = inv?.creator?.id;
        const filtered = raw.filter(u => u && u.id !== currentUserId && u.id !== ownerId && !existing.has(u.id));
        setUserResults(filtered);
        setShowUserDropdown(true);
      } catch (e) {
        setUserResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery, currentUserId, inv.accessUsers, inv?.creator?.id]);

  const addAccessMutation = useMutation(
    async () => {
      const payload = { userEmail: collabEmail.trim(), canWrite: !!collabWrite };
      if (!payload.userEmail) throw new Error('Email is required');
      const r = await axios.post(`/api/inventories/${id}/access`, payload);
      return r.data;
    },
    { onSuccess: () => { setCollabEmail(''); queryClient.invalidateQueries(['inventory', id]); } }
  );

  const removeAccessMutation = useMutation(
    async (userId) => {
      await axios.delete(`/api/inventories/${id}/access/${userId}`);
      return userId;
    },
    { onSuccess: () => { queryClient.invalidateQueries(['inventory', id]); } }
  );

  // Change permission by removing and re-adding with new canWrite
  const changeAccessMutation = useMutation(
    async ({ userId, canWrite }) => {
      const u = (inv.accessUsers || []).find((x) => x.id === userId);
      if (!u?.email) throw new Error('User email unavailable to change permission');
      await axios.delete(`/api/inventories/${id}/access/${userId}`);
      await axios.post(`/api/inventories/${id}/access`, { userEmail: u.email, canWrite: !!canWrite });
      return userId;
    },
    { onSuccess: () => { queryClient.invalidateQueries(['inventory', id]); } }
  );

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

  const deleteCommentMutation = useMutation(
    async (commentId) => {
      await axios.delete(`/api/comments/${commentId}`);
    },
    {
      onSuccess: () => {
        // Socket will remove from cache; no local action needed
      }
    }
  );

  const updateCommentMutation = useMutation(
    async ({ id: commentId, content }) => {
      const r = await axios.put(`/api/comments/${commentId}`, { content });
      return r.data;
    },
    {
      onSuccess: () => {
        setEditingId(null);
        setEditText('');
      }
    }
  );

  // Socket.IO realtime updates for chat
  const SOCKET_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL)
    ? import.meta.env.VITE_SERVER_URL
    : (typeof window !== 'undefined' && window.location ? (import.meta?.env?.MODE === 'development' ? 'https://itemplate.onrender.com' : 'https://itemplate.onrender.com') : '');
  React.useEffect(() => {
    if (!id) return;
    if (!socketRef.current) {
      try {
        socketRef.current = io(SOCKET_URL || '/', { withCredentials: true, transports: ['websocket', 'polling'] });
      } catch (e) {
        // no-op
      }
    }
    const s = socketRef.current;
    if (!s) return;

    const join = () => { try { s.emit('join-inventory', id); } catch {} };
    if (s.connected) join();
    s.on('connect', join);

    const onAdded = (c) => {
      queryClient.setQueryData(['inventory:chat', id], (prev = []) => {
        const exists = prev.some((x) => x.id === c.id);
        return exists ? prev : [...prev, c];
      });
      if (activeTab !== 'Chat' && c?.author?.id !== currentUserId) {
        setUnread((u) => u + 1);
      }
    };
    const onUpdated = (c) => {
      queryClient.setQueryData(['inventory:chat', id], (prev = []) => prev.map((x) => (x.id === c.id ? c : x)));
    };
    const onDeleted = ({ id: cid }) => {
      queryClient.setQueryData(['inventory:chat', id], (prev = []) => prev.filter((x) => x.id !== cid));
    };

    s.on('commentAdded', onAdded);
    s.on('commentUpdated', onUpdated);
    s.on('commentDeleted', onDeleted);

    return () => {
      try { s.emit('leave-inventory', id); } catch {}
      s.off('connect', join);
      s.off('commentAdded', onAdded);
      s.off('commentUpdated', onUpdated);
      s.off('commentDeleted', onDeleted);
    };
  }, [id, queryClient, activeTab, currentUserId]);

  React.useEffect(() => {
    if (!id) return;
    const s = socketRef.current;
    if (!s) return;

    const onInvUpdated = (invObj) => {
      try {
        if (!invObj || String(invObj.id) !== String(id)) return;
        // Update cache with fresh inventory and refetch dependent queries
        queryClient.setQueryData(['inventory', id], invObj);
        queryClient.invalidateQueries(['inventory', id]);
      } catch {}
    };

    const onInvDeleted = ({ id: deletedId }) => {
      try {
        if (String(deletedId) !== String(id)) return;
        // Navigate back to list if current inventory is deleted elsewhere
        navigate('/inventories');
      } catch {}
    };

    s.on('inventoryUpdated', onInvUpdated);
    s.on('inventoryDeleted', onInvDeleted);

    return () => {
      s.off('inventoryUpdated', onInvUpdated);
      s.off('inventoryDeleted', onInvDeleted);
    };
  }, [id, queryClient, navigate]);

  React.useEffect(() => {
    if (!id) return;
    const s = socketRef.current;
    if (!s) return;

    const invalidateItems = () => {
      try {
        if (embeddedItems !== null) {
          // Items are embedded in inventory response
          queryClient.invalidateQueries(['inventory', id]);
        } else {
          // Items are fetched via separate query
          queryClient.invalidateQueries(['inventory:items', id]);
        }
      } catch {}
    };

    const addOrUpdateInCache = (updater) => {
      try {
        if (embeddedItems !== null) return; // Don't mutate embedded cache directly
        queryClient.setQueryData(['inventory:items', id], (prev = []) => updater(Array.isArray(prev) ? prev : []));
      } catch {}
    };

    const onItemCreated = (item) => {
      if (!item || String(item.inventoryId) !== String(id)) return;
      addOrUpdateInCache((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item]));
      invalidateItems();
    };

    const onItemUpdated = (item) => {
      if (!item || String(item.inventoryId) !== String(id)) return;
      addOrUpdateInCache((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...item } : x)));
      invalidateItems();
    };

    const onItemDeleted = ({ id: deletedId }) => {
      if (!deletedId) return;
      addOrUpdateInCache((prev) => prev.filter((x) => String(x.id) !== String(deletedId)));
      invalidateItems();
    };

    const onItemLiked = ({ itemId, likeCount }) => {
      if (!itemId) return;
      addOrUpdateInCache((prev) => prev.map((x) => (x.id === itemId ? { ...x, likeCount } : x)));
    };

    s.on('itemCreated', onItemCreated);
    s.on('itemUpdated', onItemUpdated);
    s.on('itemDeleted', onItemDeleted);
    s.on('itemLiked', onItemLiked);

    return () => {
      s.off('itemCreated', onItemCreated);
      s.off('itemUpdated', onItemUpdated);
      s.off('itemDeleted', onItemDeleted);
      s.off('itemLiked', onItemLiked);
    };
  }, [id, queryClient, embeddedItems]);

  // Column visibility (persist per-inventory)
  const storageKey = `inv:${id}:visibleCols`;
  const defaultVisible = React.useMemo(() => {
    const base = {
      customId: true,
      createdAt: true,
    };
    for (const f of fixedSlotDefs) base[f.key] = false; // default hidden
    return base;
  }, [fixedSlotDefs]);

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
        key: 'customId',
        label: 'ID',
        render: (it) => it.customId || it.serial || it.id,
      },
      { key: 'createdAt', label: 'Created', render: (it) => (it.createdAt ? new Date(it.createdAt).toLocaleString() : '') },
    ];

    for (const f of fixedSlotDefs) {
      base.push({
        key: f.key,
        label: f.label,
        render: (it) => {
          const v = it[f.key];
          if (v == null || v === '') return '';
          if (f.type === 'boolean') return v ? 'Yes' : 'No';
          if (f.type === 'file' && typeof v === 'string') {
            return (
              <a href={v} target="_blank" rel="noreferrer" className="inline-block align-middle">
                <img
                  src={v}
                  alt={f.label}
                  className="w-10 h-10 object-cover rounded border border-gray-200"
                  referrerPolicy="no-referrer"
                />
              </a>
            );
          }
          return String(v);
        },
      });
    }
    return base;
  }, [fixedSlotDefs]);

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

  // Add new state for editing
  const [editingCell, setEditingCell] = useState({ rowId: null, field: null });
  const [editValue, setEditValue] = useState('');

  // Update item mutation
  const updateItemMutation = useMutation(
    async ({ itemId, field, value }) => {
      const response = await axios.put(
        `/api/items/${itemId}`,
        { [field]: value },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          withCredentials: true
        }
      );
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['inventory', id, 'items']);
        setEditingCell({ rowId: null, field: null });
      },
      onError: (error) => {
        console.error('Error updating item:', error);
        setSubmitErr(error.response?.data?.message || 'Failed to update item');
      }
    }
  );

  const handleCellClick = (rowId, field, value) => {
    if (editMode && selectedItem?.id === rowId) {
      setEditingCell({ rowId, field });
      setEditValue(value || '');
    }
  };

  const handleCellBlur = (rowId, field) => {
    if (editingCell.rowId && editingCell.field) {
      updateItemMutation.mutate({
        itemId: rowId,
        field: field,
        value: editValue
      });
    }
  };

  // Add edit mode state
  const [editMode, setEditMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const handleEditClick = () => {
    if (selected.size === 1) {
      const itemId = Array.from(selected)[0];
      const item = items.find(i => i.id === itemId);
      if (item) {
        setSelectedItem(item);
        setEditMode(true);
        // Clear any previous editing state
        setEditingCell({ rowId: null, field: null });
        setEditValue('');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setSelectedItem(null);
    setEditingCell({ rowId: null, field: null });
    setEditValue('');
  };

  // Update the columns definition to make cells editable
  const columnsWithEditing = React.useMemo(() => {
    const base = [
      {
        key: 'customId',
        label: 'ID',
        render: (it) => it.customId || it.serial || it.id,
      },
      { key: 'createdAt', label: 'Created', render: (it) => (it.createdAt ? new Date(it.createdAt).toLocaleString() : '') },
    ];

    for (const f of fixedSlotDefs) {
      base.push({
        key: f.key,
        label: f.label,
        render: (it) => {
          const v = it[f.key];
          if (v == null || v === '') return '';
          if (f.type === 'boolean') return v ? 'Yes' : 'No';
          if (f.type === 'file' && typeof v === 'string') {
            return (
              <a href={v} target="_blank" rel="noreferrer" className="inline-block align-middle">
                <img
                  src={v}
                  alt={f.label}
                  className="w-10 h-10 object-cover rounded border border-gray-200"
                  referrerPolicy="no-referrer"
                />
              </a>
            );
          }
          if (editMode && selectedItem?.id === it.id && editingCell.rowId === it.id && editingCell.field === f.key) {
            return (
              <div className="relative">
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleCellBlur(it.id, f.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCellBlur(it.id, f.key);
                    } else if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                  }}
                  autoFocus
                  disabled={updateItemMutation.isLoading}
                  className="w-full px-2 py-1 border border-blue-300 rounded pr-7"
                />
                {updateItemMutation.isLoading && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div 
              onClick={() => handleCellClick(it.id, f.key, v)}
              className={`px-2 py-1 ${editMode && selectedItem?.id === it.id ? 'bg-blue-50' : ''}`}
            >
              {String(v)}
            </div>
          );
        },
      });
    }
    return base;
  }, [fixedSlotDefs, editingCell, editValue, editMode, selectedItem]);

  const shownColumnsWithEditing = columnsWithEditing.filter((c) => visibleCols[c.key] !== false);

  // Safe place for loading/error checks (after all hooks)
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  // Early return for error state
  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-600 mb-2">Failed to load inventory.</p>
        <p className="text-sm text-gray-600">{error?.response?.data?.message || error?.message}</p>
        <div className="mt-4">
          <Link to="/inventories" className="text-blue-600 hover:underline">Back to list</Link>
        </div>
    </div>
    );
  }
  // (moved above) Selection handlers and deleteMutation

  const openFirstSelected = (mode) => {
    const first = Array.from(selected)[0];
    if (!first) return;
    if (mode === 'view') {
      navigate(`/items/${first}`);
    } else if (mode === 'edit') {
      navigate(`/items/${first}/edit`);
    }
  };

  // Delete modals
  const handleConfirmDeleteComment = async () => {
    if (!pendingCommentId) return;
    try {
      setIsDeletingComment(true);
      await deleteCommentMutation.mutateAsync(pendingCommentId);
    } finally {
      setIsDeletingComment(false);
      setPendingCommentId(null);
      setShowDeleteCommentModal(false);
    }
  };

  return (
    <>
    <div className="max-w-5xl mx-auto p-6"> 
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {(() => {
          const cover = inv.image || inv.imageUrl || inv.coverImage || inv.cover;
          return cover ? (
            <img src={cover} alt={inv.title} className="w-full h-64 object-cover" />
          ) : null;
        })()}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-semibold mb-2 text-gray-900">{inv.title}</h1>
              {inv.description && (
                <p className="text-gray-700 whitespace-pre-line">{inv.description}</p>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Package className="h-4 w-4" />
              <span>{itemCount} items</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>Created {createdAt}</span>
            </div>
            {inv.category && (
              <div className="text-gray-600">
                <span className="font-medium">Category:</span> {inv.category.name}
              </div>
            )}
            {inv.creator && (
              <div className="flex items-center gap-3 text-gray-600">
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
                        className="w-7 h-7 rounded-full object-cover border border-gray-200"
                      />
                      <Link to={`/profile/${inv.creator.id}`} className="text-blue-600 hover:underline">
                        {name}
                      </Link>
                    </>
                  );
                })()}
              </div>
            )}
            {Array.isArray(inv.customIdFormat) && inv.customIdFormat.length > 0 && (
              <div className="text-gray-700">
                <span className="font-medium">Next ID:</span> <span className="font-mono">{nextIdPreview}</span>
              </div>
            )}
          </div>

          {Array.isArray(inv.tags) && inv.tags.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2 text-gray-700">
                <Tag className="h-4 w-4" />
                <span className="font-medium">Tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {inv.tags.map((t) => (
                  <Link
                    key={t.id || t}
                    to={`/search?q=${encodeURIComponent(t.name || t)}`}
                    className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs hover:bg-gray-200"
                  >
                    {t.name || t}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex justify-center gap-4 overflow-x-auto" aria-label="Tabs" role="tablist">
              {visibleTabs.map((t) => (
                <a
                  key={t}
                  href="#"
                  role="tab"
                  aria-selected={activeTab === t}
                  onClick={(e) => { e.preventDefault(); setActiveTab(t); }}
                  className={`inline-block whitespace-nowrap select-none px-4 py-2 text-sm font-medium cursor-pointer
                    appearance-none bg-transparent rounded-none shadow-none outline-none focus:outline-none focus:ring-0 hover:bg-transparent active:bg-transparent border-b-2
                    ${activeTab === t
                      ? 'border-blue-600 text-gray-900'
                      : 'border-transparent text-gray-600 hover:text-gray-900'}`}
                >
                  {t === 'Chat' ? (
                    <span className="inline-flex items-center gap-2">
                      <span>Chat</span>
                      {unread > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center text-xs px-1.5 min-w-5 h-5 rounded-full bg-red-600 text-white">{unread}</span>
                      )}
                    </span>
                  ) : t}
                </a>
              ))}
            </nav>
          </div>

          {/* Items Section */}
          {activeTab === 'Items' && (
            <div className="mt-6">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Columns</h3>
                <div className="flex flex-wrap gap-4">
                  {columns.map((c) => (
                    <label key={c.key} className="inline-flex items-center gap-2 text-xs text-gray-800">
                      <input
                        type="checkbox"
                        checked={visibleCols[c.key] !== false}
                        onChange={(e) => setVisibleCols((v) => ({ ...v, [c.key]: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>

              {embeddedItems === null && canListItems() && itemsLoading ? (
                <LoadingSpinner />
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-600">No items yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Selection toolbar with icon-only actions */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-sm">
                      {/* <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300"
                        aria-label="Select all items"
                      /> */}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFirstSelected('view')}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-gray-200 text-gray-800 disabled:opacity-50 hover:bg-gray-300"
                        title="View selected"
                        aria-label="View selected"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleEditClick}
                        disabled={selected.size !== 1 || updateItemMutation.isLoading}
                        className="p-2 rounded-md bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1 min-w-[32px] justify-center"
                        title={updateItemMutation.isLoading ? 'Saving...' : 'Edit selected'}
                        aria-label={updateItemMutation.isLoading ? 'Saving...' : 'Edit selected'}
                      >
                        {updateItemMutation.isLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Pencil className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={!editMode}
                        className="p-2 rounded-md bg-gray-500 text-white disabled:opacity-50"
                        title="Cancel edit"
                        aria-label="Cancel edit"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelected}
                        disabled={selected.size === 0}
                        className="p-2 rounded-md bg-red-600 text-white disabled:opacity-50"
                        title="Delete selected"
                        aria-label="Delete selected"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={toggleSelectAll}
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
                              aria-label="Select all"
                            />
                          </th>
                          {shownColumnsWithEditing.map((c) => (
                            <th key={c.key} className="px-3 py-2 text-left">{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id} className="border-t border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSelected(it.id)}
                                onChange={() => toggleSelect(it.id)}
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
                                aria-label="Select row"
                              />
                            </td>
                            {shownColumnsWithEditing.map((c) => (
                              <td key={c.key} className="px-3 py-2">
                                {c.render(it)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Other Tabs Content */}
          {activeTab === 'Chat' && (
            <div className="mt-6">
              <div className="space-y-3 max-h-72 overflow-auto bg-gray-50 p-3 rounded">
                {(chatData || []).map((c, i) => (
                  <div key={c.id || i} className="text-sm">
                    <div className="flex items-start gap-3">
                      <img
                        src={(c.author?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(((c.author?.firstName||'') + ' ' + (c.author?.lastName||'')).trim() || c.author?.username || 'User')}&background=random`}
                        referrerPolicy="no-referrer"
                        alt={c.author?.username || 'User'}
                        className="w-7 h-7 rounded-full object-cover border border-gray-200"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">{(() => {
                          const a = c.author || {};
                          const fn = a.firstName || '';
                          const ln = a.lastName || '';
                          const full = fn && ln ? `${fn} ${ln}` : (fn || a.username || 'User');
                          return full;
                        })()}</div>
                        <div className="text-xs text-gray-600">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</div>
                        {((c.author?.id === currentUserId) || !!(typeof isAdmin !== 'undefined' && isAdmin)) && (
                          <span className="ml-auto inline-flex items-center gap-1.5">
                            {editingId === c.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { const val = editText.trim(); if (!val) return; updateCommentMutation.mutate({ id: c.id, content: val }); }}
                                  disabled={updateCommentMutation.isLoading}
                                  className="p-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                                  title={updateCommentMutation.isLoading ? 'Saving...' : 'Save'}
                                  aria-label="Save comment"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingId(null); setEditText(''); }}
                                  className="p-1.5 rounded border border-gray-300"
                                  title="Cancel"
                                  aria-label="Cancel edit"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { setEditingId(c.id); setEditText(c.content || ''); }}
                                  className="p-1.5 rounded border border-gray-300"
                                  title="Edit"
                                  aria-label="Edit comment"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setPendingCommentId(c.id); setShowDeleteCommentModal(true); }}
                                  disabled={deleteCommentMutation.isLoading}
                                  className="p-1.5 rounded border border-red-300 text-red-700 disabled:opacity-50"
                                  title={deleteCommentMutation.isLoading ? 'Deleting...' : 'Delete'}
                                  aria-label="Delete comment"
                                >
                                  <Trash size={14} />
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {editingId === c.id ? (
                      <textarea
                        rows={2}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="mt-1 w-full rounded-md border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <div className="text-gray-900">{c.content || ''}</div>
                    )}
                  </div>
                ))}
                {(chatData || []).length === 0 && (
                  <div className="text-sm text-gray-600">No messages yet.</div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          {activeTab === 'Settings' && canManageInventory && false && (
            <div className="mt-6 space-y-4">
              {/* Public toggle */}
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                  <input type="checkbox" checked={settingsForm.isPublic} onChange={(e)=>setSettingsForm((f)=>({...f,isPublic:e.target.checked}))} className="h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500" />
                  Public inventory
                </label>
                <button type="button" className="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-50" onClick={()=>updateInvMutation.mutate({ isPublic: settingsForm.isPublic })} disabled={updateInvMutation.isLoading}>
                  {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>

              {/* Collaborators list */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Collaborators</h3>
                <div className="rounded border border-gray-200 divide-y divide-gray-200">
                  {(inv.accessUsers || []).length === 0 && (
                    <div className="p-3 text-sm text-gray-600">No collaborators yet.</div>
                  )}
                  {(inv.accessUsers || []).map((u) => {
                    const canWrite = !!(u?.InventoryAccess?.canWrite);
                    const name = (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.firstName || u.username || u.email || 'User');
                    const avatar = u.avatar || '';
                    return (
                      <div key={u.id} className="p-3 flex items-center gap-3">
                        <img src={avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={name} className="w-7 h-7 rounded-full object-cover border border-gray-200" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{name}</div>
                          <div className="text-xs text-gray-600 truncate">{u.email || u.username}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-800">{canWrite ? 'Can edit' : 'Read only'}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-gray-300"
                            disabled={changeAccessMutation.isLoading || !canManageInventory}
                            onClick={() => canManageInventory && changeAccessMutation.mutate({ userId: u.id, canWrite: !canWrite })}
                            title={canWrite ? 'Make read-only' : 'Grant edit'}
                          >
                            {canWrite ? 'Make read-only' : 'Grant edit'}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-700"
                            disabled={removeAccessMutation.isLoading || !canManageInventory}
                            onClick={() => canManageInventory && removeAccessMutation.mutate(u.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add collaborator (search + select) */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-1">Add collaborator</h4>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    {!selectedUser ? (
                      <input
                        type="text"
                        placeholder="Search users by name or email"
                        value={userQuery}
                        onChange={(e)=>{ setUserQuery(e.target.value); setShowUserDropdown(true); }}
                        onFocus={()=> setShowUserDropdown(true)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        aria-autocomplete="list"
                        aria-expanded={showUserDropdown}
                      />
                    ) : (
                      <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={selectedUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((selectedUser.firstName||'')[0]||selectedUser.username||selectedUser.email)}`} alt={selectedUser.username||selectedUser.email} className="w-6 h-6 rounded-full" />
                          <div className="truncate text-sm">
                            <span className="text-gray-900">{selectedUser.firstName || selectedUser.username || selectedUser.email}</span>
                            <span className="ml-2 text-gray-600">{selectedUser.email}</span>
                          </div>
                        </div>
                        <button type="button" className="text-xs text-red-600" onClick={()=>{ setSelectedUser(null); setCollabEmail(''); setUserQuery(''); }}>Clear</button>
                      </div>
                    )}
                    {showUserDropdown && !selectedUser && userResults.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow">
                        {userResults.map(u => (
                          <li key={u.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                              onClick={() => { setSelectedUser(u); setCollabEmail(u.email || ''); setShowUserDropdown(false); }}>
                            <img src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((u.firstName||'')[0]||u.username||u.email)}`} alt={u.username||u.email} className="w-6 h-6 rounded-full" />
                            <div className="min-w-0">
                              <div className="truncate text-gray-900">{(u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.firstName || u.username || u.email)}</div>
                              <div className="truncate text-xs text-gray-600">{u.email}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={collabWrite} onChange={(e)=>setCollabWrite(e.target.checked)} className="h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500" />
                      Can edit
                    </label>
                    <button
                      type="button"
                      onClick={() => canManageInventory && addAccessMutation.mutate()}
                      disabled={!canManageInventory || addAccessMutation.isLoading || !selectedUser || !collabEmail.trim()}
                      className="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                    >
                      {addAccessMutation.isLoading ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  {addAccessMutation.isError && (
                    <div className="text-xs text-red-600">{addAccessMutation.error?.response?.data?.message || addAccessMutation.error?.message}</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'Settings' && canManageInventory && (
            <div className="mt-6 space-y-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Title</label>
                <input value={settingsForm.title} onChange={(e)=>setSettingsForm((f)=>({...f,title:e.target.value}))} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Description</label>
                <textarea rows={3} value={settingsForm.description} onChange={(e)=>setSettingsForm((f)=>({...f,description:e.target.value}))} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={settingsForm.isPublic} onChange={(e)=>setSettingsForm((f)=>({...f,isPublic:e.target.checked}))} className="h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500" />
                Public inventory
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image (optional)</label>
                {settingsForm.imageUrl && (
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative">
                      <img src={settingsForm.imageUrl} alt="cover" className="w-20 h-20 object-cover rounded border border-gray-200" />
                      <span
                        onClick={() => { setSettingsForm((f)=>({ ...f, imageUrl: '' })); setCoverFileKey((k)=>k+1); }}
                        title="Remove"
                        aria-label="Remove"
                        className="absolute -top-1 -right-1 cursor-pointer select-none 
                        w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-black text-sm leading-none"                      >
                        ×
                      </span>
                    </div>
                    <a href={settingsForm.imageUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a>
                  </div>
                )}
                <div className="space-y-2">
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      key={`cover-${coverFileKey}`}
                      onChange={async (e) => { const file = e.target.files?.[0] || null; if (!file) return; try { const url = await uploadInventoryCover(file); setSettingsForm((f)=>({ ...f, imageUrl: url })); } catch (err) { alert(err?.response?.data?.message || err.message || 'Upload failed'); } }}
                      className="block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
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
                <div className="mb-2 text-sm text-gray-700">
                  Example: <span className="font-mono">{previewCustomId(cidFormat, itemCount)}</span>
                </div>
              )}
              <div className="space-y-2">
                {cidFormat.map((el, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-32 text-xs uppercase text-gray-500">{el.type}</span>
                    {(el.type === 'text' || el.type === 'fixed') && (
                      <input value={el.value || ''} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,value:e.target.value}; setCidFormat(next); }} className="flex-1 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    )}
                    {el.type === 'sequence' && (
                      <input type="number" min={0} value={el.padding ?? 0} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,padding:Number(e.target.value||0)}; setCidFormat(next); }} className="w-24 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    )}
                    {el.type === 'datetime' && (
                      <input value={el.format || 'YYYYMMDD'} onChange={(e)=>{ const next=[...cidFormat]; next[idx]={...el,format:e.target.value}; setCidFormat(next); }} placeholder="YYYYMMDD or YYYY-MM-DD" className="flex-1 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    )}
                    <div className="flex items-center gap-1">
                      <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300" disabled={idx===0} onClick={()=>{ const n=[...cidFormat]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; setCidFormat(n); }}>↑</button>
                      <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300" disabled={idx===cidFormat.length-1} onClick={()=>{ const n=[...cidFormat]; [n[idx+1],n[idx]]=[n[idx],n[idx+1]]; setCidFormat(n); }}>↓</button>
                      <button type="button" className="px-2 py-1 text-xs rounded border border-red-300 text-red-700" onClick={()=>setCidFormat(cidFormat.filter((_,i)=>i!==idx))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={cidNewType} onChange={(e)=>setCidNewType(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="text">Fixed</option>
                  <option value="random20">20-bit random (X5)</option>
                  <option value="random32">32-bit random (X8)</option>
                  <option value="random6">Random 6-digit</option>
                  <option value="random9">Random 9-digit</option>
                  <option value="guid">GUID</option>
                  <option value="datetime">Date/time</option>
                  <option value="sequence">Sequence</option>
                </select>
                <button type="button" className="px-3 py-1.5 rounded border border-gray-300" onClick={()=>{
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
                    <h4 className="text-sm font-medium text-gray-900 mb-1">{
                      ({
                        singleLineText: 'Single line',
                        multiLineText: 'Multi line',
                        numeric: 'Numeric',
                        boolean: 'Boolean',
                        documentImage: 'Document/Image'
                      })[k] || k
                    }</h4>
                    <ul className="mb-1 space-y-2 text-sm text-gray-700">
                      {(cfBuilder[k]||[]).map((n,idx)=>(
                        <li key={`${k}-${idx}`} className="flex items-center gap-2">
                          <input
                            value={n}
                            onChange={(e)=> setCfBuilder((b)=>{ const arr=[...(b[k]||[])]; arr[idx]=e.target.value; return { ...b, [k]: arr }; })}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button type="button" className="text-xs text-red-600" onClick={()=> setCfBuilder((b)=>({ ...b, [k]: (b[k]||[]).filter((_,i)=>i!==idx) }))}>Remove</button>
                        </li>
                      ))}
                      {((cfBuilder[k]||[]).length === 0) && (
                        <li className="text-xs text-gray-500">No fields added</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={cfNewType} onChange={(e)=>setCfNewType(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="singleLineText">Single line</option>
                  <option value="multiLineText">Multi line</option>
                  <option value="numeric">Numeric</option>
                  <option value="boolean">Boolean</option>
                  <option value="documentImage">Document/Image</option>
                </select>
                <input value={cfNewName} onChange={(e)=>setCfNewName(e.target.value)} placeholder="Field name" className="rounded-md border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <button type="button" className="px-3 py-1.5 rounded border border-gray-300" onClick={()=>{ const name=cfNewName.trim(); if(!name) return; setCfBuilder((b)=> ({ ...b, [cfNewType]: [ ...(b[cfNewType]||[]), name ] })); setCfNewName(''); }}>Add field</button>
                <button type="button" className="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white" disabled={updateInvMutation.isLoading} onClick={()=>updateInvMutation.mutate({ customFields: cfBuilder })}>
                  {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Access' && canManageInventory && (
            <div className="mt-6 space-y-4">
              {/* Public toggle */}
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                  <input type="checkbox" checked={settingsForm.isPublic} onChange={(e)=>setSettingsForm((f)=>({...f,isPublic:e.target.checked}))} className="h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500" />
                  Public inventory
                </label>
                <button type="button" className="px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-50" onClick={()=>updateInvMutation.mutate({ isPublic: settingsForm.isPublic })} disabled={updateInvMutation.isLoading}>
                  {updateInvMutation.isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>

              {/* Collaborators list */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Collaborators</h3>
                <div className="rounded border border-gray-200 divide-y divide-gray-200">
                  {(inv.accessUsers || []).length === 0 && (
                    <div className="p-3 text-sm text-gray-600">No collaborators yet.</div>
                  )}
                  {(inv.accessUsers || []).map((u) => {
                    const canWrite = !!(u?.InventoryAccess?.canWrite);
                    const name = (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.firstName || u.username || u.email || 'User');
                    const avatar = u.avatar || '';
                    return (
                      <div key={u.id} className="p-3 flex items-center gap-3">
                        <img src={avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={name} className="w-7 h-7 rounded-full object-cover border border-gray-200" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{name}</div>
                          <div className="text-xs text-gray-600 truncate">{u.email || u.username}</div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-800">{canWrite ? 'Can edit' : 'Read only'}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-gray-300"
                            disabled={changeAccessMutation.isLoading || !canManageInventory}
                            onClick={() => canManageInventory && changeAccessMutation.mutate({ userId: u.id, canWrite: !canWrite })}
                            title={canWrite ? 'Make read-only' : 'Grant edit'}
                          >
                            {canWrite ? 'Make read-only' : 'Grant edit'}
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-700"
                            disabled={removeAccessMutation.isLoading || !canManageInventory}
                            onClick={() => canManageInventory && removeAccessMutation.mutate(u.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add collaborator (search + select) */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-1">Add collaborator</h4>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    {!selectedUser ? (
                      <input
                        type="text"
                        placeholder="Search users by name or email"
                        value={userQuery}
                        onChange={(e)=>{ setUserQuery(e.target.value); setShowUserDropdown(true); }}
                        onFocus={()=> setShowUserDropdown(true)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        aria-autocomplete="list"
                        aria-expanded={showUserDropdown}
                      />
                    ) : (
                      <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={selectedUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((selectedUser.firstName||'')[0]||selectedUser.username||selectedUser.email)}`} alt={selectedUser.username||selectedUser.email} className="w-6 h-6 rounded-full" />
                          <div className="truncate text-sm">
                            <span className="text-gray-900">{selectedUser.firstName || selectedUser.username || selectedUser.email}</span>
                            <span className="ml-2 text-gray-600">{selectedUser.email}</span>
                          </div>
                        </div>
                        <button type="button" className="text-xs text-red-600" onClick={()=>{ setSelectedUser(null); setCollabEmail(''); setUserQuery(''); }}>Clear</button>
                      </div>
                    )}
                    {showUserDropdown && !selectedUser && userResults.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow">
                        {userResults.map(u => (
                          <li key={u.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex items-center gap-2"
                              onClick={() => { setSelectedUser(u); setCollabEmail(u.email || ''); setShowUserDropdown(false); }}>
                            <img src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent((u.firstName||'')[0]||u.username||u.email)}`} alt={u.username||u.email} className="w-6 h-6 rounded-full" />
                            <div className="min-w-0">
                              <div className="truncate text-gray-900">{(u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.firstName || u.username || u.email)}</div>
                              <div className="truncate text-xs text-gray-600">{u.email}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                      <input type="checkbox" checked={collabWrite} onChange={(e)=>setCollabWrite(e.target.checked)} className="h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500" />
                      Can edit
                    </label>
                    <button
                      type="button"
                      onClick={() => canManageInventory && addAccessMutation.mutate()}
                      disabled={!canManageInventory || addAccessMutation.isLoading || !selectedUser || !collabEmail.trim()}
                      className="ml-auto px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                    >
                      {addAccessMutation.isLoading ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  {addAccessMutation.isError && (
                    <div className="text-xs text-red-600">{addAccessMutation.error?.response?.data?.message || addAccessMutation.error?.message}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Stats' && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {/* Total items */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Items</div>
                <div className="text-lg text-gray-900">{itemCount}</div>
              </div>

              {/* Created date */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Created</div>
                <div className="text-lg text-gray-900">{createdAt}</div>
              </div>

              {/* Activity sparkline (14 days) */}
              <div className="p-3 rounded bg-gray-50 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <div className="text-gray-500">Last 14 days</div>
                  <div className="text-xs text-gray-500">max {spark.max}</div>
                </div>
                <svg viewBox={`0 0 ${spark.w} ${spark.h}`} className="mt-1 w-full h-8">
                  <path d={spark.d} fill="none" stroke="#3b82f6" strokeWidth="2" />
                </svg>
              </div>

              {/* Collaborators */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Collaborators</div>
                <div className="text-lg text-gray-900">{Array.isArray(inv.accessUsers) ? inv.accessUsers.length : 0}</div>
              </div>

              {/* Comments count */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Comments</div>
                <div className="text-lg text-gray-900">{Array.isArray(chatData) ? chatData.length : 0}</div>
              </div>

              {/* Likes (aggregated from item likes) */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Likes</div>
                <div className="text-lg text-gray-900">{totalLikes}</div>
              </div>

              {/* Visibility */}
              <div className="p-3 rounded bg-gray-50">
                <div className="text-gray-500">Visibility</div>
                <div className="text-lg">
                  <span className={`px-2 py-0.5 rounded text-xs ${inv.isPublic ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                    {inv.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
              </div>

              {Array.isArray(inv.tags) && inv.tags.length > 0 && (
                <div className="p-3 rounded bg-gray-50 col-span-2">
                  <div className="text-gray-500 mb-1">Tags</div>
                  <div className="flex flex-wrap gap-2">
                    {inv.tags.map((t)=> (<span key={t.id||t} className="px-2 py-0.5 rounded bg-gray-100 text-xs">{t.name || t}</span>))}
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
                  const headers = shownColumnsWithEditing.map((c)=>c.label);
                  const rows = items.map((it)=> shownColumnsWithEditing.map((c)=> {
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
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Add Item</h3>
            {submitErr && <p className="mb-2 text-red-600">{submitErr}</p>}
            {fixedSlotDefs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fixedSlotDefs.map((f) => {
                  const val = newItem[f.key] ?? '';
                  const setVal = (v) => setNewItem((x) => ({ ...x, [f.key]: v }));
                  if (f.type === 'boolean') {
                    return (
                      <label key={f.key} className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => setVal(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
                        />
                        {f.label}
                      </label>
                    );
                  }
                  if (f.type === 'number') {
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => setVal(e.target.value ? Number(e.target.value) : '')}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    );
                  }
                  // file uploader for document/image string slots
                  if (f.type === 'file') {
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                        {val && typeof val === 'string' && (
                          <div className="flex items-center gap-3 mb-2">
                            <div className="relative">
                              <img src={val} alt={f.label} className="w-16 h-16 object-cover rounded border border-gray-200" />
                              <span
                                onClick={() => { setVal(''); setFileKeys((k) => ({ ...k, [f.key]: (k[f.key] || 0) + 1 })); }}
                                title="Remove"
                                aria-label="Remove"
                                className="absolute -top-1 -right-1 cursor-pointer select-none 
                                w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-black text-sm leading-none"                              >
                                ×
                              </span>
                            </div>
                            <a href={val} target="_blank" rel="noreferrer" className="text-blue-600 underline">View</a>
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
                          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                      </div>
                    );
                  }
                  // default string input
                  return (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                      <input
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              disabled={addItemMutation.isLoading}
              onClick={() => {
                const payload = {};
                for (const f of fixedSlotDefs) {
                  if (newItem[f.key] !== undefined) payload[f.key] = newItem[f.key];
                }
                addItemMutation.mutate(payload);
              }}
              className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded-md"
            >
              {addItemMutation.isLoading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
          )}

          <div className="mt-8">
            <Link to="/inventories" className="text-blue-600 hover:underline">Back to list</Link>
          </div>
        </div>
      </div>
    </div>
    <DeleteModal
      open={showDeleteItemsModal}
      title="Delete Items"
      description={`Delete ${pendingItemIds.length} selected item(s)?`}
      isLoading={isDeletingItems}
      onConfirm={handleConfirmDeleteItems}
      onClose={() => { if (!isDeletingItems) { setShowDeleteItemsModal(false); setPendingItemIds([]); } }}
    />
    <DeleteModal
      open={showDeleteCommentModal}
      title="Delete Comment"
      description="Are you sure you want to delete this comment?"
      isLoading={isDeletingComment || deleteCommentMutation.isLoading}
      onConfirm={handleConfirmDeleteComment}
      onClose={() => { if (!isDeletingComment && !deleteCommentMutation.isLoading) { setShowDeleteCommentModal(false); setPendingCommentId(null); } }}
    />
    </>
  );
}
