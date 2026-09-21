<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LanguageMenu from '@/i18n/LanguageMenu.vue'
import { DEFAULT_OPTIONS } from '@shared/engine'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

/**
 * The front door, and the whole of it: a name, then hosting or joining.
 *
 * There is deliberately nothing about games here. Which game gets played is the
 * host's decision and it is made in the lobby, with the table already seated —
 * putting a shelf of games in front of every guest asked seven of eight players
 * a question that was never theirs, and made the first screen the busiest one
 * in the app.
 */
const game = useGameStore()

const name = ref(game.myName)
const code = ref((new URLSearchParams(location.search).get('room') ?? '').toUpperCase())

/** Arriving on an invite link, there is no choice to present: only the join. */
const invited = ref(code.value.length > 0)

const busy = computed(() => game.connection !== 'open')

/*
 * Validation is answered where the mistake was made rather than in the toast at
 * the foot of the screen: a name that is missing belongs under the name box.
 * The server's refusals — no such room, room full, game already started — are
 * caught the same way, by remembering that a join is outstanding and claiming
 * whatever error comes back next for the code box.
 */
const nameError = ref('')
const codeError = ref('')
let joinPending = false

watch(
  () => game.error,
  (message) => {
    if (!message || !joinPending) return
    joinPending = false
    codeError.value = message
  },
)

watch(name, () => (nameError.value = ''))
watch(code, () => (codeError.value = ''))

function named(): boolean {
  if (name.value.trim()) return true
  nameError.value = t('home.error.name')
  return false
}

function remember() {
  game.rememberName(name.value.trim())
}

function host() {
  if (!named()) return
  remember()
  // Whatever the room ends up playing, it is created with the defaults: the
  // host picks the game, and its settings, in the lobby.
  game.createRoom(name.value.trim(), { ...DEFAULT_OPTIONS })
}

function join() {
  if (!named()) return
  if (code.value.trim().length !== 4) {
    codeError.value = t('home.error.code')
    return
  }
  remember()
  joinPending = true
  game.joinRoom(code.value.trim(), name.value.trim())
}
</script>

<template>
  <div class="start">
    <LanguageMenu class="lang-corner" />

    <main class="sheet">
      <header class="masthead">
        <h1>{{ t('landing.title') }}</h1>
        <p class="lead">{{ t('start.lead') }}</p>
      </header>

      <div class="field-block">
        <label class="label" for="player-name">{{ t('home.name.title') }}</label>
        <input
          id="player-name"
          v-model="name"
          class="field name"
          maxlength="18"
          autocomplete="nickname"
          :aria-invalid="!!nameError"
          :placeholder="t('home.name.placeholder')"
          @change="remember"
          @keyup.enter="invited ? join() : host()"
        />
        <p v-if="nameError" class="error" role="alert">{{ nameError }}</p>
      </div>

      <!-- An invite link knows which table it opens, so it collapses the two
           actions to the one that applies. Hosting stays one tap away. -->
      <template v-if="invited">
        <div class="field-block">
          <label class="label" for="room-code">{{ t('start.join.label') }}</label>
          <input
            id="room-code"
            v-model="code"
            class="field code"
            maxlength="4"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            :aria-invalid="!!codeError"
            :placeholder="t('home.join.placeholder')"
            @input="code = code.toUpperCase()"
            @keyup.enter="join"
          />
          <p v-if="codeError" class="error" role="alert">{{ codeError }}</p>
        </div>

        <button class="btn primary" :disabled="busy" @click="join">
          {{ t('home.join.action') }}
        </button>
        <button type="button" class="linkish" @click="invited = false">
          {{ t('home.invited.hostInstead') }}
        </button>
      </template>

      <template v-else>
        <button class="btn primary" :disabled="busy" @click="host">
          {{ t('start.host.action') }}
        </button>

        <p class="rule"><span>{{ t('start.or') }}</span></p>

        <div class="field-block">
          <label class="label" for="room-code">{{ t('start.join.have') }}</label>
          <div class="join-row">
            <input
              id="room-code"
              v-model="code"
              class="field code"
              maxlength="4"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              :aria-invalid="!!codeError"
              :placeholder="t('home.join.placeholder')"
              @input="code = code.toUpperCase()"
              @keyup.enter="join"
            />
            <button class="btn ghost join" :disabled="busy" @click="join">
              {{ t('home.join.action') }}
            </button>
          </div>
          <p v-if="codeError" class="error" role="alert">{{ codeError }}</p>
        </div>
      </template>
    </main>

    <p class="tiny muted footnote">{{ t('landing.footnote') }}</p>
  </div>
</template>

<style scoped>
.start {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: clamp(1.5rem, 5vw, 3rem) 1.25rem;
}

.lang-corner {
  position: absolute;
  top: clamp(1.1rem, 2.5vw, 1.9rem);
  right: clamp(1.25rem, 3vw, 2.5rem);
}

/*
 * One column, not a card: there is no border or shadow here, because a panel
 * around the only thing on the screen is a frame around a frame.
 */
.sheet {
  width: 100%;
  max-width: 23rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.masthead {
  text-align: center;
  margin-bottom: 0.25rem;
}

.masthead h1 {
  font-size: clamp(1.9rem, 7vw, 2.6rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1.1;
}

.lead {
  margin: 0.6rem 0 0;
  color: var(--ink-soft);
  line-height: 1.5;
  font-family: var(--font-body);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.label {
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.field {
  width: 100%;
  min-height: 2.75rem;
}

.name {
  font-size: 1rem;
}

/* Four characters read aloud over a phone, so they are set wide and plain. */
.code {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  text-indent: 0.4em;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.join-row {
  display: flex;
  gap: 0.5rem;
}

.join-row .code {
  flex: 1 1 auto;
  min-width: 0;
}

.join-row .join {
  flex: none;
  white-space: nowrap;
}

/* The one action this screen is for. */
.btn.primary {
  width: 100%;
  min-height: 2.9rem;
  font-size: 1rem;
}

.btn.ghost.join {
  min-height: 2.75rem;
}

.linkish {
  align-self: center;
}

/* A rule with the word sitting in the gap, rather than a heading that would
   read as a third section. */
.rule {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.15rem 0;
  color: var(--ink-faint);
  font-family: var(--font-body);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.rule::before,
.rule::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--gold-line);
}

.error {
  margin: 0;
  color: var(--vermillion-dark);
  font-family: var(--font-body);
  font-size: 0.82rem;
  line-height: 1.35;
}

.field[aria-invalid='true'] {
  border-color: var(--vermillion);
}

.footnote {
  max-width: 26rem;
  text-align: center;
  line-height: 1.5;
}

/* Stacked, and everything full width: a 4-character box beside a button is a
   cramped pair of targets on a narrow phone. */
@media (max-width: 26rem) {
  .join-row {
    flex-direction: column;
  }

  .join-row .join {
    width: 100%;
  }
}
</style>
