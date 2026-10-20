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
  <!-- formularz w sekcjach: treść, grafika i film, przycisk z linkiem, kto widzi, powiadomienia -->
  <fieldset class="plain" :disabled="!annEditable">
    <section class="form-sec">
      <h3><span class="fs-n">1</span>Treść</h3>
      <label for="anTitle">Tytuł <span class="req">*</span></label>
      <input id="anTitle" v-model="currentAnn.title" :class="{ invalid: !currentAnn.title.trim() }" placeholder="np. Chrzest wodny — zapisy do 1 listopada" autocomplete="off">
      <label for="anText">Treść</label>
      <textarea id="anText" v-model="currentAnn.text" class="ann-text" placeholder="Co, kiedy, gdzie, dla kogo"></textarea>
    </section>

    <section v-if="drive.uploadImage || currentAnn.image || annEditable" class="form-sec">
      <h3><span class="fs-n">2</span>Grafika i film <small>opcjonalnie</small></h3>
      <p class="form-hint"><svg class="i"><use href="#info"/></svg><span>Grafikę wgrasz z telefonu albo komputera — albo wkleisz link z <b>Dysku Google</b> (plik udostępniony „Każda osoba mająca link”).</span></p>
      <label>Grafika</label>
      <img v-if="currentAnn.image" class="ann-img edit" :src="currentAnn.image" alt="">
      <div v-if="drive.uploadImage && annEditable" class="row">
        <button type="button" :disabled="imgBusy" @click="$refs.annImg.click()"><svg class="i"><use href="#image"/></svg>{{ imgBusy ? 'Wysyłam…' : currentAnn.image ? 'Zmień grafikę' : 'Wgraj grafikę' }}</button>
        <button v-if="currentAnn.image" type="button" :disabled="imgBusy" @click="currentAnn.image = ''"><svg class="i"><use href="#trash"/></svg>Usuń grafikę</button>
      </div>
      <input ref="annImg" type="file" accept="image/*" hidden @change="pickAnnImage">
      <ImageLinkInput v-if="annEditable && !currentAnn.image" @pick="u => { const first = !currentAnn.image; currentAnn.image = u; if (first && !annSavedOnce) currentAnn.projector = true }" />
      <label v-if="currentAnn.image" class="check"><input v-model="currentAnn.projector" type="checkbox">Pokaż na nabożeństwie w ogłoszeniach — ta grafika w pętli ogłoszeń na rzutniku (przed i po)</label>
      <p v-if="currentAnn.image && currentAnn.projector" class="note" style="margin:4px 0 0">Na rzutniku widać tylko grafikę — umieść na niej to, co najważniejsze: co, kiedy, gdzie.</p>
      <label for="anVideo" class="fs-gap">Film</label>
      <div v-if="videoInfo(currentAnn.video)" class="ann-video">
        <video v-if="videoInfo(currentAnn.video).kind === 'file'" :src="videoInfo(currentAnn.video).src" controls playsinline preload="metadata"></video>
        <iframe v-else :src="videoInfo(currentAnn.video).embed" title="Film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>
      </div>
      <template v-if="annEditable">
        <input v-if="!/\/ogloszenia\//.test(currentAnn.video || '')" id="anVideo" v-model.trim="currentAnn.video" placeholder="Link do YouTube, Vimeo albo Google Dysku" autocomplete="off" inputmode="url">
        <p v-if="currentAnn.video && !videoInfo(currentAnn.video)" class="error" style="margin:6px 0 0">To nie wygląda na link do filmu (YouTube, Vimeo, Google Dysk).</p>
        <div class="row" style="margin-top:8px">
          <button v-if="drive.uploadFile" type="button" :disabled="vidBusy" @click="$refs.annVid.click()"><svg class="i"><use href="#plus"/></svg>{{ vidBusy ? 'Wysyłam film…' : 'Wgraj film (do 30 MB)' }}</button>
          <button v-if="currentAnn.video" type="button" :disabled="vidBusy" @click="currentAnn.video = ''"><svg class="i"><use href="#trash"/></svg>Usuń film</button>
        </div>
        <input ref="annVid" type="file" accept="video/mp4,video/webm,video/quicktime" hidden @change="pickAnnVideo">
      </template>
    </section>

    <section class="form-sec">
      <h3><span class="fs-n">3</span>Przycisk z linkiem <small>opcjonalnie</small></h3>
      <label for="anLink">Adres</label>
      <input id="anLink" v-model.trim="currentAnn.link" placeholder="np. formularz zapisów, strona wydarzenia" autocomplete="off" inputmode="url">
      <template v-if="currentAnn.link">
        <label for="anLinkText">Napis na przycisku</label>
        <input id="anLinkText" v-model="currentAnn.linkText" placeholder="np. „Zapisz się”" autocomplete="off">
      </template>
    </section>

    <section class="form-sec">
      <h3><span class="fs-n">4</span>Kto widzi i jak długo</h3>
      <label for="anAud">Kto widzi</label>
      <UiSelect id="anAud" v-model="currentAnn.audience" label="Kto widzi" :options="[{ value: 'public', label: 'Wszyscy — także goście bez konta', disabled: (currentAnn.ministries || []).length > 0 }, { value: 'members', label: 'Członkowie (zatwierdzeni)' }, ...(hasCouncil || currentAnn.audience === 'council' ? [{ value: 'council', label: 'Tylko rada zboru' }] : [])]" />
      <MinistryPicker v-if="api.enabled && currentAnn.audience !== 'council'" :model-value="currentAnn.ministries || []" @update:model-value="v => { currentAnn.ministries = v; if (v.length && currentAnn.audience === 'public') currentAnn.audience = 'members' }" />
      <label for="anUntil">Ważne do <small class="muted">(opcjonalnie — potem znika ze strony głównej, zostaje w archiwum)</small></label>
      <input id="anUntil" v-model="currentAnn.until" type="date">
      <label v-if="hasCouncil && currentAnn.audience !== 'council'" class="check"><input v-model="currentAnn.important" type="checkbox">Komunikat rady zboru — na górze strony głównej</label>
      <label v-if="canEdit || canReview" class="check"><input v-model="currentAnn.pinned" type="checkbox">Przypnij — zawsze nad innymi ogłoszeniami</label>
    </section>
  </fieldset>
  <p v-if="currentAnn.author" class="note who">Autor: {{ currentAnn.author }}<template v-if="currentAnn.updated > 1">, {{ dateTime(currentAnn.updated) }}</template></p>
  <section v-if="canNotify && annEditable" class="form-sec notify-box">
    <h3><span class="fs-n">5</span>Powiadomienia <small>opcjonalnie</small></h3>
    <button type="button" class="songsbtn" :disabled="busy" @click="openNotify"><svg class="i"><use href="#bell"/></svg>{{ notify.ids.length ? 'Powiadomię: ' + notifySummary : 'Wybierz, kogo powiadomić' }}<svg class="i chev"><use href="#chev"/></svg></button>
    <p class="note" style="margin:6px 0 0">Po zapisaniu powiadomienie pojawi się w aplikacji (dzwonek), a dodatkowo na telefonach osób, które je włączyły.</p>
  </section>
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
