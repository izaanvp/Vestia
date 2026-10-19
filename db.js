// Almacenamiento local: IndexedDB para prendas, outfits, diario y tu foto; localStorage para el perfil.

const DB_NAME = 'vestia';
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      // v2: diario de looks (una entrada por día, clave AAAA-MM-DD). v3: fotos propias (probador con tu foto)
      const req = indexedDB.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ['items', 'outfits', 'diary', 'media']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const res = fn(s);
    t.oncomplete = () => resolve(res?.result ?? res);
    t.onerror = () => reject(t.error);
  });
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
export const remove = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());

const KEY = 'vestia.profile';
export const DEFAULT_PROFILE = {
  name: '',
  avatar: '',
  bio: '',
  styles: [],
  brands: [],
  accent: '#19b5ad',
  curtain: true,
  shopFor: 'Todo',
  sizes: '',
  season: null,
  colorTest: null,
  brandChecks: {},
  skin: null,
  hair: 'Castaño',
  vision: false,
  reader: '',
  wishlist: [],
};

export function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT_PROFILE }; }
}
export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); }
  catch { /* almacenamiento lleno o bloqueado */ }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
