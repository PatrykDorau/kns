// Własne okno potwierdzenia zamiast systemowego confirm(): await ask('Usunąć?', { ok: 'Usuń', danger: true }) → true / false.
import { reactive } from 'vue'

type AskOpts = { ok?: string; cancel?: string; danger?: boolean; title?: string }
export const askState = reactive<{ open: boolean; text: string; title: string; ok: string; cancel: string; danger: boolean; resolve: ((v: boolean) => void) | null }>({
  open: false, text: '', title: '', ok: 'Tak', cancel: 'Anuluj', danger: false, resolve: null,
})
export function ask(text: string, opts: AskOpts = {}): Promise<boolean> {
  askState.resolve?.(false) // poprzednie pytanie (gdyby jeszcze wisiało) — jak „Anuluj”
  return new Promise(resolve => {
    Object.assign(askState, { open: true, text, title: opts.title || '', ok: opts.ok || 'Tak', cancel: opts.cancel || 'Anuluj', danger: !!opts.danger, resolve })
  })
}
export function answer(v: boolean) {
  const r = askState.resolve
  Object.assign(askState, { open: false, resolve: null })
  r?.(v)
}
