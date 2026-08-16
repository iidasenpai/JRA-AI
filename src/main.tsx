import React from "react";
import ReactDOM from "react-dom/client";
import JRAPredictionTool from "./JRAPredictionTool";
import "./index.css";

type StorageResult = { value: string | null };

declare global {
  interface Window {
    storage: {
      get: (key: string) => Promise<StorageResult>;
      set: (key: string, value: string) => Promise<void>;
    };
    Tesseract?: any;
  }
}

// Saved races can quickly exceed localStorage's ~5 MB browser quota.
// Keep the same async API used by the app, but store values in IndexedDB.
// Existing localStorage values are migrated lazily and are never deleted.
const DB_NAME = "jra-ai-storage";
const STORE_NAME = "keyval";
const DB_VERSION = 1;

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGet = async (key: string): Promise<string | null> => {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
};

const idbSet = async (key: string, value: string): Promise<void> => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
};

window.storage = {
  async get(key: string) {
    try {
      const value = await idbGet(key);
      if (value !== null) return { value };
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        try { await idbSet(key, legacy); } catch (_) {}
        return { value: legacy };
      }
      return { value: null };
    } catch (_) {
      return { value: localStorage.getItem(key) };
    }
  },
  async set(key: string, value: string) {
    try {
      await idbSet(key, value);
      // Do not mirror large race archives back to localStorage: that is the old 50R-ish ceiling.
      if (key !== "jra-saved-races") {
        try { localStorage.setItem(key, value); } catch (_) {}
      }
    } catch (e) {
      // Last-resort compatibility fallback. Let quota errors propagate so the UI can report them.
      localStorage.setItem(key, value);
    }
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JRAPredictionTool />
  </React.StrictMode>,
);
