/// <reference types="vite/client" />

interface NavigatorUAData {
  readonly platform?: string
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
