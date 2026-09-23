/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del servicio wa-checker embebido en la sección "Verificador WA". */
  readonly VITE_WACHECKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
