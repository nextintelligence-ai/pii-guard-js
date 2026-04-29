/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: 'production' | 'development' | 'nlp';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
