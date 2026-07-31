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

window.storage = {
  async get(key: string) {
    return { value: localStorage.getItem(key) };
  },
  async set(key: string, value: string) {
    localStorage.setItem(key, value);
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JRAPredictionTool />
  </React.StrictMode>,
);
