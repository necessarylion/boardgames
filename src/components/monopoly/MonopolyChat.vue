<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CHAT_MAX } from '@shared/chat'
import type { ChatEntry } from '@shared/chat'
import { PLAYER_COLOURS } from '@shared/colours'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

/**
 * The room's talk, beside the board.
 *
 * Nothing here renders through `v-html` — every message goes through `{{ }}`,
 * which escapes it. That, rather than the sanitiser on the way in, is what
 * makes a message carrying markup harmless; the sanitiser deals with what plain
 * text can still do (newlines, hidden characters) and with length.
 */
const props = defineProps<{
  /**
   * Whether the chat is the thing on screen. It is kept mounted while hidden —
   * so a half-typed line survives a look at the log — but a hidden element has
   * no scroll height to speak of, so it has to be sent to the newest message
   * when it comes back rather than only when it is first created.
   */
  open: boolean
}>()

const game = useGameStore()

const entries = computed<ChatEntry[]>(() => game.mpChat)
const draft = ref('')
const feed = ref<HTMLElement | null>(null)

/**
 * Whether the feed is following the newest line. A reader who has scrolled up
 * to catch up on something is not dragged back down every time someone types —
 * they are told there is more below instead, and following resumes the moment
 * they return to the bottom themselves.
 */
const following = ref(true)
const missed = ref(0)

/** Within this much of the bottom still counts as being at it. */
const BOTTOM_SLACK = 24

function onScroll() {
  const el = feed.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
  following.value = atBottom
  if (atBottom) missed.value = 0
}

async function toBottom(smooth = false) {
  await nextTick()
  const el = feed.value
  if (!el) return
  // `scrollTo` is what gives the smooth glide, but it is not everywhere — jsdom
  // has no such method at all — so the plain assignment is the fallback.
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  } else {
    el.scrollTop = el.scrollHeight
  }
  following.value = true
  missed.value = 0
}

/*
 * Keyed on the newest message's id rather than on how many there are. The room
 * keeps only the last hundred, so past that the length never changes again —
 * the feed would stop following and nothing would be counted as missed. Ids are
 * handed out from a counter that survives the trim, so they always move, and
 * the difference between two of them is how many arrived.
 */
watch(
  () => entries.value.at(-1)?.id ?? -1,
  (now, before) => {
    if (following.value) void toBottom()
    else missed.value += Math.max(0, now - (before ?? now))
  },
)

/** Coming into view lands on the newest line, not on wherever it was left. */
watch(
  [feed, () => props.open],
  ([el, open]) => {
    if (el && open) void toBottom()
  },
  { flush: 'post', immediate: true },
)

const left = computed(() => CHAT_MAX - draft.value.trim().length)
const canSend = computed(() => draft.value.trim().length > 0)

function send() {
  if (!canSend.value) return
  if (game.mpSay(draft.value)) draft.value = ''
  void toBottom(true)
}

/** A short clock — the day is never in question in a game lasting an hour. */
function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** System lines are worded here, so each client reads them in its own language. */
function systemLine(entry: ChatEntry): string {
  if (entry.kind === 'joined') return t('chat.joined', { name: entry.name })
  if (entry.kind === 'left') return t('chat.left', { name: entry.name })
  if (entry.kind === 'away') return t('chat.away', { name: entry.name })
  return t('chat.back', { name: entry.name })
}
</script>

<template>
  <div class="chat">
    <div ref="feed" class="feed" role="log" aria-live="polite" @scroll="onScroll">
      <p v-if="!entries.length" class="tiny muted empty">{{ t('chat.empty') }}</p>

      <template v-for="entry in entries" :key="entry.id">
        <p v-if="entry.kind !== 'said'" class="line system tiny">
          <span class="dot" :style="{ background: PLAYER_COLOURS[entry.colour].fill }" />
          <span>{{ systemLine(entry) }}</span>
          <time :datetime="new Date(entry.at).toISOString()">{{ clock(entry.at) }}</time>
        </p>

        <p v-else class="line said" :class="{ mine: entry.seat === game.you }">
          <span class="who" :style="{ color: PLAYER_COLOURS[entry.colour].ink }">
            <span class="dot" :style="{ background: PLAYER_COLOURS[entry.colour].fill }" />
            {{ entry.name }}
          </span>
          <time :datetime="new Date(entry.at).toISOString()">{{ clock(entry.at) }}</time>
          <span class="text">{{ entry.text }}</span>
        </p>
      </template>
    </div>

    <!-- Only while the reader is behind: the feed is following otherwise. -->
    <button v-if="!following" type="button" class="catch-up tiny" @click="toBottom(true)">
      {{ missed ? t('chat.newCount', { count: missed }) : t('chat.toNewest') }}
    </button>

    <form class="composer" @submit.prevent="send">
      <label class="sr-only" for="chat-input">{{ t('chat.label') }}</label>
      <input
        id="chat-input"
        v-model="draft"
        class="field"
        :maxlength="CHAT_MAX"
        :placeholder="t('chat.placeholder')"
        autocomplete="off"
        @keyup.enter="send"
      />
      <button type="submit" class="btn small send" :disabled="!canSend">{{ t('chat.send') }}</button>
    </form>
    <p class="tiny muted count" :class="{ low: left <= 20 }">{{ t('chat.remaining', { n: left }) }}</p>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  position: relative;
}

.feed {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-family: var(--font-body);
}

.empty {
  margin: auto 0;
  text-align: center;
  line-height: 1.5;
}

.line {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.line time {
  margin-left: 0.35rem;
  color: var(--ink-faint);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.who {
  font-weight: 600;
}

.dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  margin-right: 0.3rem;
  vertical-align: baseline;
}

.text {
  display: block;
}

/* Your own lines are tinted rather than moved to the other side: a log that
   zig-zags is harder to scan, and the colour already says who spoke. */
.said.mine {
  background: rgba(178, 58, 44, 0.07);
  border-radius: 6px;
  padding: 0.15rem 0.35rem;
  margin: 0 -0.35rem;
}

.system {
  color: var(--ink-faint);
  font-style: italic;
}

.catch-up {
  position: absolute;
  left: 50%;
  bottom: 4.6rem;
  transform: translateX(-50%);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  box-shadow: var(--shadow);
  color: var(--ink);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.composer {
  flex: none;
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem 0.2rem;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

.composer .field {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.9rem;
}

.send {
  flex: none;
}

.count {
  flex: none;
  margin: 0;
  padding: 0 0.6rem 0.45rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.count.low {
  color: var(--vermillion-dark);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
