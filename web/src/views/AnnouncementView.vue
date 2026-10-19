<script lang="ts">
// @ts-nocheck — szablon przeniesiony z App.vue; stan i działania wspólne (useApp)
import { defineComponent } from 'vue'
import { useApp } from '@/composables/useApp'
import MinistryPicker from '@/components/MinistryPicker.vue'

// ogłoszenie
export default defineComponent({ components: { MinistryPicker }, setup: () => useApp() })
</script>

<template>
  <!-- podgląd ogłoszenia (dla wszystkich); edycja dopiero po „Edytuj” (osoby z prawem edycji) -->
  <article v-if="!annEditing" class="ann-view">
    <p v-if="currentAnn.status === 'pending'" class="pending-note"><svg class="i"><use href="#bell"/></svg>{{ canReview ? 'Zgłoszenie czeka na Twoje zatwierdzenie' + (currentAnn.author ? ' — od: ' + currentAnn.author : '') + '.' : 'Czeka na zatwierdzenie — po zatwierdzeniu zobaczą je wszyscy.' }}</p>
    <div v-if="canReview && currentAnn.status === 'pending'" class="approve-row">
      <button :disabled="busy" @click="rejectAnn"><svg class="i"><use href="#x"/></svg>Odrzuć</button>
      <button class="primary" :disabled="busy" @click="approveAnn"><svg class="i"><use href="#check"/></svg>Zatwierdź i opublikuj</button>
    </div>
    <img v-if="currentAnn.image" class="ann-hero" :src="currentAnn.image" alt="">
    <div class="ann-tags">
      <span v-if="currentAnn.pinned" class="ann-tag pin"><svg class="i"><use href="#pin"/></svg>Przypięte</span>
      <span v-if="currentAnn.important" class="ann-tag imp"><svg class="i"><use href="#alert"/></svg>Komunikat rady zboru</span>
      <span class="ann-tag">{{ (currentAnn.ministries || []).length ? 'Tylko: ' + ministryNames(currentAnn.ministries) : AUDIENCE[currentAnn.audience] }}</span>
      <span v-if="currentAnn.until" class="ann-tag">ważne do {{ shortDate(currentAnn.until) }}</span>
      <span v-if="currentAnn.projector && currentAnn.image" class="ann-tag"><svg class="i"><use href="#monitor"/></svg>Na rzutniku</span>
    </div>
    <h2 class="ann-view-title">{{ currentAnn.title }}</h2>
    <p class="ann-view-meta"><template v-if="currentAnn.author">{{ currentAnn.author }} · </template>{{ shortDate(currentAnn.date || currentAnn.updated) }}</p>
    <div v-if="currentAnn.text" class="ann-view-text">{{ currentAnn.text }}</div>
    <div v-if="videoInfo(currentAnn.video)" class="ann-video">
      <video v-if="videoInfo(currentAnn.video).kind === 'file'" :src="videoInfo(currentAnn.video).src" controls playsinline preload="metadata"></video>
      <iframe v-else :src="videoInfo(currentAnn.video).embed" title="Film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
    </div>
    <a v-if="currentAnn.link" class="button ann-link" :href="currentAnn.link" target="_blank" rel="noopener"><svg class="i"><use href="#link"/></svg>{{ currentAnn.linkText || 'Otwórz link' }}<svg class="i chev"><use href="#chev"/></svg></a>
    <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
    <button v-if="annEditable" class="ann-edit-btn" @click="annEditing = true"><svg class="i"><use href="#pencil"/></svg>Edytuj ogłoszenie</button>
  </article>
  <template v-else>
  <p v-if="!annSavedOnce && !canEdit && !canReview" class="pending-note"><svg class="i"><use href="#bell"/></svg>Ogłoszenie pojawi się po zatwierdzeniu przez lidera newslettera, radę zboru albo administratora.</p>
  <fieldset class="plain" :disabled="!annEditable">
    <div v-if="!currentAnn.image && drive.uploadImage" class="ann-tip">
      <svg class="i"><use href="#monitor"/></svg>
      <span><b>Ma się wyświetlać na nabożeństwie?</b><small>Na rzutniku i na transmisji pokazują się tylko grafiki — najpierw dodaj grafikę z ogłoszeniem (co, kiedy, gdzie), potem tytuł i treść.</small></span>
      <button type="button" class="small" :disabled="imgBusy" @click="$refs.annImg.click()"><svg class="i"><use href="#image"/></svg>{{ imgBusy ? 'Wysyłam…' : 'Dodaj grafikę' }}</button>
    </div>
    <label for="anTitle">Tytuł <span class="req">*</span></label>
    <input id="anTitle" v-model="currentAnn.title" :class="{ invalid: !currentAnn.title.trim() }" autocomplete="off">
    <label for="anText">Treść</label>
    <textarea id="anText" v-model="currentAnn.text" class="ann-text"></textarea>
    <template v-if="drive.uploadImage || currentAnn.image">
      <label>Grafika (opcjonalnie)</label>
      <img v-if="currentAnn.image" class="ann-img edit" :src="currentAnn.image" alt="">
      <div v-if="drive.uploadImage && annEditable" class="row">
        <button type="button" :disabled="imgBusy" @click="$refs.annImg.click()"><svg class="i"><use href="#plus"/></svg>{{ imgBusy ? 'Wysyłam…' : currentAnn.image ? 'Zmień grafikę' : 'Dodaj grafikę' }}</button>
        <button v-if="currentAnn.image" type="button" :disabled="imgBusy" @click="currentAnn.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
      </div>
      <input ref="annImg" type="file" accept="image/*" hidden @change="pickAnnImage">
      <label v-if="currentAnn.image" class="check"><input v-model="currentAnn.projector" type="checkbox">Pokaż na nabożeństwie — ta grafika w pętli ogłoszeń na rzutniku (przed i po)</label>
      <p v-if="currentAnn.image" class="note">Na rzutniku pokazują się tylko grafiki — umieść na niej wszystkie ważne informacje (co, kiedy, gdzie).</p>
    </template>
    <label for="anVideo">Film (opcjonalnie)</label>
    <div v-if="videoInfo(currentAnn.video)" class="ann-video">
        <video v-if="videoInfo(currentAnn.video).kind === 'file'" :src="videoInfo(currentAnn.video).src" controls playsinline preload="metadata"></video>
        <iframe v-else :src="videoInfo(currentAnn.video).embed" title="Film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
      </div>
    <template v-if="annEditable">
      <input v-if="!/\/ogloszenia\//.test(currentAnn.video || '')" id="anVideo" v-model.trim="currentAnn.video" placeholder="Link do YouTube lub Vimeo" autocomplete="off" inputmode="url">
      <p v-if="currentAnn.video && !videoInfo(currentAnn.video)" class="error" style="margin:6px 0 0">To nie wygląda na link do filmu (YouTube, Vimeo).</p>
      <div class="row" style="margin-top:8px">
        <button v-if="drive.uploadFile" type="button" :disabled="vidBusy" @click="$refs.annVid.click()"><svg class="i"><use href="#plus"/></svg>{{ vidBusy ? 'Wysyłam film…' : 'Wgraj film (do 50 MB)' }}</button>
        <button v-if="currentAnn.video" type="button" :disabled="vidBusy" @click="currentAnn.video = ''"><svg class="i"><use href="#trash"/></svg>Usuń film</button>
      </div>
      <input ref="annVid" type="file" accept="video/mp4,video/webm,video/quicktime" hidden @change="pickAnnVideo">
    </template>
    <label for="anLink">Link (opcjonalnie)</label>
    <input id="anLink" v-model.trim="currentAnn.link" placeholder="np. formularz zapisów, strona wydarzenia" autocomplete="off" inputmode="url">
    <input v-if="currentAnn.link" v-model="currentAnn.linkText" placeholder="Tekst przycisku, np. „Zapisz się”" autocomplete="off" style="margin-top:8px">
    <label for="anAud">Kto widzi</label>
    <select id="anAud" v-model="currentAnn.audience" class="field">
      <option value="public">Wszyscy — także goście bez konta</option>
      <option value="members">Członkowie (zatwierdzeni)</option>
      <option v-if="hasCouncil || currentAnn.audience === 'council'" value="council">Tylko rada zboru</option>
    </select>
    <MinistryPicker v-if="api.enabled && currentAnn.audience !== 'council'" :model-value="currentAnn.ministries || []" @update:model-value="v => { currentAnn.ministries = v; if (v.length && currentAnn.audience === 'public') currentAnn.audience = 'members' }" />
    <label v-if="hasCouncil && currentAnn.audience !== 'council'" class="check"><input v-model="currentAnn.important" type="checkbox">Komunikat rady zboru — na górze strony głównej</label>
    <label v-if="canEdit || canReview" class="check"><input v-model="currentAnn.pinned" type="checkbox">Przypnij — zawsze nad innymi ogłoszeniami</label>
    <label for="anUntil">Ważne do (opcjonalnie)</label>
    <input id="anUntil" v-model="currentAnn.until" type="date">
    <p class="note" style="margin-top:4px">Po tej dacie ogłoszenie znika ze strony głównej (zostaje w archiwum).</p>
  </fieldset>
  <p v-if="currentAnn.author" class="note who">Autor: {{ currentAnn.author }}<template v-if="currentAnn.updated > 1">, {{ dateTime(currentAnn.updated) }}</template></p>
  <div v-if="canNotify && annEditable" class="notify-box">
    <label>Powiadom osoby (opcjonalnie)</label>
    <button type="button" class="songsbtn" :disabled="busy" @click="openNotify"><svg class="i"><use href="#bell"/></svg>{{ notify.ids.length ? 'Powiadomię: ' + notifySummary : 'Wybierz, kogo powiadomić' }}<svg class="i chev"><use href="#chev"/></svg></button>
    <p class="note" style="margin:6px 0 0">Po zapisaniu powiadomienie pojawi się w aplikacji (dzwonek), a dodatkowo na telefonach osób, które je włączyły.</p>
  </div>
  <p class="saved" role="status"><template v-if="status"><svg class="i"><use href="#check"/></svg>{{ status }}</template></p>
  <div v-if="annEditable" class="bar">
    <template v-if="annSavedOnce">
      <button v-if="confirmDelete" class="danger" :disabled="busy" @click="removeAnn">Na pewno usuń</button>
      <button v-else :disabled="busy" aria-label="Usuń ogłoszenie" @click="confirmDelete = true"><svg class="i"><use href="#trash"/></svg></button>
    </template>
    <button class="primary" :disabled="busy || (!annDirty && !notify.ids.length) || !currentAnn.title.trim()" @click="saveAnn()">
      <svg v-if="!annDirty && !notify.ids.length && !busy" class="i"><use href="#check"/></svg>{{ busy ? 'Zapisuję…' : annDirty ? 'Zapisz' : notify.ids.length ? 'Wyślij powiadomienie' : 'Zapisane' }}
    </button>
  </div>
  </template>
</template>
