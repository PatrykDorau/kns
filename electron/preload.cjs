const { contextBridge, ipcRenderer, webUtils } = require('electron')

const on = channel => handler => {
  const listener = (e, data) => handler(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('api', {
  // rzutnik
  getDisplays: invoke('displays:get'),
  onDisplays: on('displays:changed'),
  openOutput: invoke('output:open'),
  closeOutput: invoke('output:close'),
  onOutputState: on('output:state'),
  show: payload => ipcRenderer.send('output:show', payload),
  videoCmd: cmd => ipcRenderer.send('output:video', cmd),
  onVideoState: on('video:state'),

  // pliki i dane
  pickFiles: invoke('files:pick'),
  importFiles: invoke('files:import'),
  readPdf: invoke('files:readPdf'),
  saveImage: invoke('files:saveImage'),
  pptxToSlides: invoke('files:pptx'),
  onPptxProgress: on('pptx:progress'),
  // niewidoczne okno renderujące slajdy
  pptxData: invoke('pptx:data'),
  pptxSlide: invoke('pptx:slide'),
  pptxDone: error => ipcRenderer.send('pptx:done', error),
  removeFile: invoke('files:remove'),
  pathForFile: file => webUtils.getPathForFile(file),
  loadStore: invoke('store:load'),
  saveStore: invoke('store:save'),
  pickSongFiles: invoke('songs:pick'),
  exportSongs: invoke('songs:export'),
  exportService: invoke('service:export'),
  importService: invoke('service:import'),
  sharedPick: invoke('shared:pick'),
  sharedSuggest: invoke('shared:suggest'),
  sharedEnsure: invoke('shared:ensure'),
  googleLogin: invoke('google:login'),
  googleLogout: invoke('google:logout'),
  googleStatus: invoke('google:status'),
  sharedCheck: invoke('shared:check'),
  sharedAccount: invoke('shared:account'),
  sharedRead: invoke('shared:read'),
  sharedWrite: invoke('shared:write'),
  sharedRemove: invoke('shared:remove'),
  sharedSongsRead: invoke('shared:songsRead'),
  sharedSongsWrite: invoke('shared:songsWrite'),
  exportBackup: invoke('backup:export'),
  importBackup: invoke('backup:import'),

  // sygnały dla kamerzysty
  setCue: invoke('cue:set'),
  sendCue: invoke('cue:send'),
  onCueClients: on('cue:clients'),
  onCueRemote: on('cue:remote'),
  onCueQuota: on('cue:quota'),
  userName: invoke('app:user'),
  setCompact: invoke('window:compact'),
  setOnTop: invoke('window:onTop'),
  biblePick: invoke('bible:pick'),
  updateState: invoke('update:state'),
  installUpdate: invoke('update:install'),
  onUpdate: on('update:state'),

  // pilot w telefonie
  setRemote: invoke('remote:set'),
  remoteState: state => ipcRenderer.send('remote:state', state),
  onRemoteCmd: on('remote:cmd'),

  // okno rzutnika
  outputReady: () => ipcRenderer.send('output:ready'),
  onShow: on('show'),
  onVideoCmd: on('video:cmd'),
  videoState: state => ipcRenderer.send('output:video-state', state),
})
