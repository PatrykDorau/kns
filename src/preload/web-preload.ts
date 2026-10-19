// Strona kns-nabo wbudowana w aplikację na komputer (znacznik <webview>): to samo co w przeglądarce, a do tego
// logowanie tym samym kontem Google co aplikacja i przejście do Rzutnika/Stream. Strona widzi tylko to, co poniżej.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('knsDesktop', {
  // token tożsamości Google (aplikacja jest już zalogowana) → strona loguje się do bazy bez drugiego logowania
  idToken: () => ipcRenderer.invoke('web:idToken'),
  // ekrany, których nie ma na stronie: 'display' (Rzutnik), 'stream' (Stream)
  open: role => ipcRenderer.sendToHost('kns:open', String(role)),
  // logowanie i wylogowanie robi aplikacja (Google w przeglądarce systemowej)
  login: () => ipcRenderer.sendToHost('kns:login'),
  logout: () => ipcRenderer.sendToHost('kns:logout'),
})
