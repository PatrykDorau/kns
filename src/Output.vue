<script setup>
import { onMounted, ref } from 'vue'
import Stage from './Stage.vue'

const item = ref(null)
const stage = ref(null)
const frozen = ref(false)
const blank = ref(false)
let volume = 1
// Stan odsyłany do panelu sterowania: pozycja filmu i numer slajdu sceny.
const state = { time: 0, duration: 0, paused: true, step: 0 }
const send = () => window.api.videoState({ ...state })

function onVideo(v) {
  if (v.volume !== volume) v.volume = volume
  Object.assign(state, { time: v.currentTime, duration: isFinite(v.duration) ? v.duration : 0, paused: v.paused })
  send()
}
function onStep(n) {
  state.step = n
  send()
}

onMounted(() => {
  document.title = 'Kościół Na Skale — obraz na rzutnik'
  document.body.classList.add('output')
  window.api.onShow(payload => {
    if (payload?.volume != null) volume = payload.volume
    item.value = payload
  })
  window.api.onVideoCmd(cmd => {
    if (cmd.type === 'volume') volume = cmd.value
    else if (cmd.type === 'freeze') frozen.value = cmd.value
    else if (cmd.type === 'blank') blank.value = cmd.value
    else if (cmd.type === 'step' && !frozen.value) stage.value?.setStep(cmd.value)
    const v = stage.value?.video
    if (!v) return
    if (cmd.type === 'toggle') v.paused ? v.play() : v.pause()
    else if (cmd.type === 'play') v.play()
    else if (cmd.type === 'seek') v.currentTime = cmd.value
    else if (cmd.type === 'volume') v.volume = volume
  })
  window.api.outputReady()
})
</script>

<template>
  <Stage ref="stage" :item="item" live :frozen="frozen || blank" :class="{ blank }" @video="onVideo" @step="onStep" />
</template>
