// Pulpit streamu: stan nadawania (electron/streamer.cjs), YouTube (electron/youtube.cjs) i ATEM (electron/atem.cjs).

// Nadawanie (FFmpeg) — wysyłane przez proces główny przy każdej zmianie.
export interface StreamState {
  running: boolean
  starting: boolean
  encoder?: string
  fps?: number
  bitrate?: string
  time?: string
  drop?: number
  speed?: string
  error?: string
  restarts?: number
  previewUrl?: string
  backlog?: number // ile sekund obrazu czeka na wysłanie
  stalled?: boolean
  skipped?: number
  target?: number // docelowa przepływność (kb/s)
}

export interface YtIssue {
  severity: string
  reason: string
  text: string
}

// Stały klucz transmisji aplikacji.
export interface YtStream {
  id: string
  url: string
  key: string
  backupUrl: string
  status: string // np. active, inactive
  health: string
  issues: YtIssue[]
}

export interface YtBroadcast {
  id: string
  title: string
  description: string
  start: string
  status: string // created, ready, testing, live…
  privacy: string
  streamId: string
  url: string
  autoStart: boolean
  autoStop: boolean
  monitor: boolean
  viewers?: number
}

export interface YtOverview {
  loggedIn: boolean
  channel?: string
  channelId?: string
  stream?: YtStream
  broadcasts?: YtBroadcast[]
  error?: string
}

export interface AtemInput {
  id: number
  name: string
  short?: string
  [field: string]: unknown
}

export interface AtemState {
  connected: boolean
  address: string
  model?: string
  inputs: AtemInput[]
  program: number | null
  preview: number | null
  streaming: string
  recording: string
  service?: { name: string; url: string; hasKey: boolean } | null
  error?: string
}
