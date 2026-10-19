// Stan i działania aplikacji (z App.vue) udostępniane widokom i oknom: setup: () => useApp().
// Widoki zwracają cały obiekt — w szablonie działa tak samo jak dawniej jeden duży szablon.
import { inject, provide, type InjectionKey } from 'vue'

type AppState = Record<string, any>
const APP: InjectionKey<AppState> = Symbol('app')

export function provideApp<T extends AppState>(state: T): T {
  provide(APP, state)
  return state
}
export function useApp(): AppState {
  const app = inject(APP)
  if (!app) throw new Error('useApp() poza aplikacją')
  return app
}
