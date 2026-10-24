// Studio streamu: cały obraz transmisji składa aplikacja (płótno 1920×1080). Moduły według tematu:
// state (stan), look (podgląd → wizja), scenes / cards / media / projector / camera (rysowanie), audio, encoder, loop.
export { ANN_MEDIA, SCENES, OVERLAYS, studio } from './state'
export { differs, initLook, setDirect, setMediaPos, setOverlayMode, setPip, setScene, showMediaFull, toggleEndOverlay, togglePrayer, showMediaOverlay, take, toggleLowerThird, toggleLyrics } from './look'
export { addCountdown, countdownLeft, setCountdown, showSlide, slideCandidates, upcomingService } from './cards'
export { airMedia, mediaCtl, mediaSlide } from './media'
export { setRemoteScreen } from './projector'
export { listCameras, setCamera } from './camera'
export { audioInfo, setAudio } from './audio'
export { addMusic, music, nextMusic, playAllMusic, playMusic, removeMusic, setMusicVolume, stopMusic, toggleMusic } from './music'
export { checkHardware, requestKeyFrame, startEncoding, stopEncoding } from './encoder'
export { pauseIdle, previewCanvas, setFps, studioCanvas } from './loop'
