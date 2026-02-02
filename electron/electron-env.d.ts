/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  database: {
    query: <T = any>(sql: string, params?: any[]) => Promise<{ success: boolean; data?: T[]; error?: string }>
    queryOne: <T = any>(sql: string, params?: any[]) => Promise<{ success: boolean; data?: T | null; error?: string }>
    execute: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: { affectedRows: number; insertId?: number }; error?: string }>
    testConnection: () => Promise<{ success: boolean; message?: string; error?: string }>
  }
}
