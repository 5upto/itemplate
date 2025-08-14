// Centralized API endpoints for items to avoid hardcoding and 404s
// Configure via Vite env variables in .env.local or .env:
// VITE_ITEMS_LIST_ENDPOINT options:
//   nested   -> GET /api/inventories/:id/items
//   flat     -> GET /api/items?inventoryId=:id
//   none     -> no list endpoint; assume items are embedded on inventory payload
// VITE_ITEMS_CREATE_ENDPOINT options:
//   nested   -> POST /api/inventories/:id/items
//   flat     -> POST /api/items with { inventoryId }
//   custom   -> Use VITE_ITEMS_CREATE_PATH. If the path contains ':id', it will post there; otherwise it will post to that path with { inventoryId } in body.
//   none     -> no create endpoint

const LIST_MODE = (import.meta?.env?.VITE_ITEMS_LIST_ENDPOINT || 'custom').toLowerCase();
const CREATE_MODE = (import.meta?.env?.VITE_ITEMS_CREATE_ENDPOINT || 'flat').toLowerCase();
const DEFAULT_LIST_PATH = '/api/items/inventory/:id';

export const canListItems = () => LIST_MODE !== 'none';
export const canCreateItems = () => CREATE_MODE !== 'none';

export function getItemsListRequest(id, axios) {
  if (!id) return Promise.resolve([]);
  switch (LIST_MODE) {
    case 'nested':
      return axios.get(`/api/inventories/${id}/items`).then(r => Array.isArray(r.data) ? r.data : r.data?.items || []);
    case 'flat':
      return axios.get(`/api/items`, { params: { inventoryId: id } }).then(r => Array.isArray(r.data) ? r.data : r.data?.items || []);
    case 'custom': {
      const path = (import.meta?.env?.VITE_ITEMS_LIST_PATH || DEFAULT_LIST_PATH).trim();
      if (!path) return Promise.resolve([]);
      if (path.includes(':id')) {
        const url = path.replace(':id', id);
        return axios.get(url).then(r => Array.isArray(r.data) ? r.data : r.data?.items || []);
      }
      // treat as flat with query param ?inventoryId=
      return axios.get(path, { params: { inventoryId: id } }).then(r => Array.isArray(r.data) ? r.data : r.data?.items || []);
    }
    case 'none':
    default:
      // No remote listing; rely on embedded items
      return Promise.resolve([]);
  }
}

export function createItemRequest(id, payload, axios) {
  if (!id) return Promise.reject(new Error('Missing inventory id'));
  switch (CREATE_MODE) {
    case 'nested':
      return axios.post(`/api/inventories/${id}/items`, payload).then(r => r.data);
    case 'flat':
      return axios.post(`/api/items`, { ...payload, inventoryId: id }).then(r => r.data);
    case 'custom': {
      const path = (import.meta?.env?.VITE_ITEMS_CREATE_PATH || '').trim();
      if (!path) return Promise.reject(new Error('VITE_ITEMS_CREATE_PATH not set'));
      if (path.includes(':id')) {
        const url = path.replace(':id', id);
        return axios.post(url, payload).then(r => r.data);
      }
      return axios.post(path, { ...payload, inventoryId: id }).then(r => r.data);
    }
    case 'none':
    default:
      return Promise.reject(new Error('Item creation endpoint is not configured'));
  }
}
