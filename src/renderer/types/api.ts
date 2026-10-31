// Most do procesu głównego Electrona (electron/preload.cjs → window.api).
// Wywołania „invoke” zwracają obietnicę; „on…” rejestrują słuchacza i zwracają funkcję, która go odpina.

type Invoke = (...args: any[]) => Promise<any>
type Listen<T = any> = (handler: (data: T) => void) => () => void

export interface DisplayInfo {
  id: number
  label?: string
  primary?: boolean
  bounds?: { x: number; y: number; width: number; height: number }
  [field: string]: unknown
}

export interface OutputState {
  open: boolean
  fullscreen: boolean
  waiting: boolean
}

export interface KnsApi {
  webUrl: Invoke
  webClear?: Invoke
  // rzutnik
  getDisplays: () => Promise<DisplayInfo[]>
  onDisplays: Listen<DisplayInfo[]>
  openOutput: Invoke
  closeOutput: Invoke
  onOutputState: Listen<OutputState>
  show: (payload: unknown) => void
  videoCmd: (cmd: unknown) => void
  onVideoState: Listen
  // pliki i dane
  pickFiles: Invoke
  importFiles: Invoke
  readPdf: Invoke
  fetchFile: Invoke
  saveImage: Invoke
  pptxToSlides: Invoke
  onPptxProgress: Listen
  pptxData: Invoke
  pptxSlide: Invoke
  pptxDone: (error?: string) => void
  removeFile: Invoke
  pickMusic: Invoke
  pathForFile: (file: File) => string
  loadStore: Invoke
  saveStore: Invoke
  pickSongFiles: Invoke
  songsFromDrive: Invoke
  onSongsDriveProgress: Listen
  exportSongs: Invoke
  exportService: Invoke
  importService: Invoke
  sharedPick: Invoke
  sharedSuggest: Invoke
  sharedEnsure: Invoke
  mirrorNames: Invoke
  mirrorUpload: Invoke
  mirrorFetch: Invoke
  mirrorClean: Invoke
  googleLogin: Invoke
  googleLogout: Invoke
  googleStatus: Invoke
  cloudIdToken: Invoke
  cloudMapFiles: Invoke
  cloudStoreFiles: Invoke
  sharedCheck: Invoke
  sharedAccount: Invoke
  sharedRead: Invoke
  sharedWrite: Invoke
  sharedRemove: Invoke
  sharedSongsRead: Invoke
  sharedSongsWrite: Invoke
  exportBackup: Invoke
  importBackup: Invoke
  // sygnały dla kamerzysty
  setCue: Invoke
  sendCue: Invoke
  onCueClients: Listen
  onCueRemote: Listen
  onCueQuota: Listen
  userName: Invoke
  setCompact: Invoke
  setOnTop: Invoke
  biblePick: Invoke
  updateState: Invoke
  installUpdate: Invoke
  onUpdate: Listen
  // pilot w telefonie, napisy
  setRemote: Invoke
  setLyrics: Invoke
  // pulpit streamu: ATEM i YouTube
  atemConnect: Invoke
  atemDisconnect: Invoke
  atemState: Invoke
  atemRun: Invoke
  onAtemState: Listen
  ytStatus: Invoke
  ytLogin: Invoke
  ytLogout: Invoke
  ytOverview: Invoke
  ytCreate: Invoke
  ytUpdate: Invoke
  ytEnd: Invoke
  ytBind: Invoke
  ytKeep: Invoke
  ytGoLive: Invoke
  streamDevices: Invoke
  streamState: Invoke
  streamStart: Invoke
  streamStop: Invoke
  streamAudio: Invoke
  captureTarget: Invoke
  hostname: () => Promise<string>
  streamLyrics: (text: string) => void
  onStreamState: Listen
  streamStartStudio: Invoke
  studioVideo: (buf: ArrayBuffer | Uint8Array) => void
  studioAudio: (buf: ArrayBuffer | Uint8Array) => void
  onStudioNeedKey: Listen
  remoteState: (state: unknown) => void
  onRemoteCmd: Listen
  // okno rzutnika
  outputReady: () => void
  onShow: Listen
  onVideoCmd: Listen
  videoState: (state: unknown) => void
}

declare global {
  interface Window {
    api: KnsApi
    rzutnik?: unknown // uchwyt do stanu z konsoli i w testach
    rzutnikStream?: unknown
  }
}
