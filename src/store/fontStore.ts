import { create } from 'zustand';
import { readFileAsArrayBuffer } from '../lib/util';

const FONT_DB = 'neon-studio-fonts';
const FONT_STORE = 'fonts';
const CUSTOM_KEY = 'neon-studio/custom-fonts/v1';

interface CustomFontMeta {
  family: string;
  fileName: string;
}

interface FontStore {
  customFonts: CustomFontMeta[];
  loaded: boolean;
  init: () => Promise<void>;
  upload: (file: File) => Promise<string>;
  remove: (family: string) => Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FONT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FONT_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, 'readwrite');
    tx.objectStore(FONT_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGetAll(): Promise<Array<[string, ArrayBuffer]>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, 'readonly');
    const req = tx.objectStore(FONT_STORE).getAll();
    const keysReq = tx.objectStore(FONT_STORE).getAllKeys();
    tx.oncomplete = () => {
      const keys = keysReq.result as string[];
      resolve(keys.map((k, i) => [k, req.result[i] as ArrayBuffer]));
      db.close();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, 'readwrite');
    tx.objectStore(FONT_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function readMeta(): CustomFontMeta[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]') as CustomFontMeta[];
  } catch {
    return [];
  }
}

function writeMeta(meta: CustomFontMeta[]): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(meta));
}

export const useFontStore = create<FontStore>((set, get) => ({
  customFonts: [],
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const metas = readMeta();
    try {
      const entries = await idbGetAll();
      for (const [family, buffer] of entries) {
        try {
          const face = new FontFace(family, buffer);
          await face.load();
          document.fonts.add(face);
        } catch (err) {
          console.warn('字体加载失败', family, err);
        }
      }
    } catch (err) {
      console.warn('IndexedDB 不可用，自定义字体将无法持久化', err);
    }
    set({ customFonts: metas, loaded: true });
  },

  upload: async (file) => {
    const buffer = await readFileAsArrayBuffer(file);
    const family = `NeonFont_${file.name.replace(/\.[^.]+$/, '').replace(/[^\w一-龥-]+/g, '')}`;
    const face = new FontFace(family, buffer);
    await face.load();
    document.fonts.add(face);
    try {
      await idbPut(family, buffer);
    } catch (err) {
      console.warn('字体持久化失败', err);
    }
    const meta = readMeta().filter((m) => m.family !== family);
    meta.push({ family, fileName: file.name });
    writeMeta(meta);
    set({ customFonts: meta });
    return family;
  },

  remove: async (family) => {
    try {
      await idbDelete(family);
    } catch (err) {
      console.warn(err);
    }
    const meta = readMeta().filter((m) => m.family !== family);
    writeMeta(meta);
    set({ customFonts: meta });
  },
}));
