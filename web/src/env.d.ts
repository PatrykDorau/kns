/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
interface Window {
  supabase?: any // udawana baza w testach (skrypty/test-ui/udawana-baza.js)
  knsDesktop?: any // strona otwarta w aplikacji na komputer
  google?: any // logowanie Google (skrypt accounts.google.com)
  [key: string]: any
}
