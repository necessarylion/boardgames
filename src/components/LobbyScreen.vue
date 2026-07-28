<script setup lang="ts">
import { computed, ref } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { supplyPerCaste } from '@shared/setup'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const copied = ref(false)

const seats = computed(() => game.players)
const canStart = computed(() => game.isHost && seats.value.length >= 2)

const shareLink = computed(() => `${location.origin}${location.pathname}?room=${game.state?.code}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    game.showError('Could not copy — select the link and copy it manually.')
  }
}

function toggle(key: 'randomHands' | 'openInformation') {
  const options = game.state?.options
  if (!options) return
  game.setOptions({ ...options, [key]: !options[key] })
}
</script>

<template>
  <div class="lobby">
    <header class="head">
      <div>
        <p class="tiny muted">Room code</p>
        <h1 class="code">{{ game.state?.code }}</h1>
      </div>
      <div class="share">
        <button class="btn ghost small" @click="copyLink">
          {{ copied ? 'Link copied' : 'Copy invite link' }}
        </button>
        <button class="btn ghost small" @click="game.leaveRoom()">Leave</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel block">
        <h2>Players <span class="tiny muted">{{ seats.length }} / 4</span></h2>
        <ul class="seats">
          <li v-for="seat in seats" :key="seat.id" class="seat">
            <span class="swatch" :style="{ background: PLAYER_COLOURS[seat.colour].fill, borderColor: PLAYER_COLOURS[seat.colour].ink }" />
            <span class="seat-name">{{ seat.name }}</span>
            <span v-if="seat.id === game.state?.hostId" class="badge">Host</span>
            <span v-if="seat.id === game.you" class="badge you">You</span>
            <span v-if="!seat.connected" class="badge away">Away</span>
          </li>
          <li v-for="n in 4 - seats.length" :key="`empty${n}`" class="seat empty">
            <span class="swatch empty-swatch" />
            <span class="muted">Waiting for a player…</span>
          </li>
        </ul>
      </section>

      <section class="panel block">
        <h2>Table settings</h2>
        <label class="check" :class="{ locked: !game.isHost }">
          <input
            type="checkbox"
            :checked="game.state?.options.randomHands"
            :disabled="!game.isHost"
            @change="toggle('randomHands')"
          />
          <span>Deal opening hands at random</span>
        </label>
        <label class="check" :class="{ locked: !game.isHost }">
          <input
            type="checkbox"
            :checked="game.state?.options.openInformation"
            :disabled="!game.isHost"
            @change="toggle('openInformation')"
          />
          <span>Open information (captured pieces stay visible)</span>
        </label>
        <p v-if="!game.isHost" class="tiny muted">Only the host can change these.</p>

        <hr class="rule" />
        <p class="tiny muted">
          With {{ Math.max(seats.length, 2) }} players the supply is
          {{ supplyPerCaste(Math.max(seats.length, 2)) }} pieces of each caste, and the board is
          sized to match.
        </p>

        <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
          {{ game.isHost ? 'Start game' : 'Waiting for the host…' }}
        </button>
        <p v-if="game.isHost && seats.length < 2" class="tiny muted centre">
          At least two players are needed.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem;
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.code {
  font-size: 3rem;
  letter-spacing: 0.3em;
  line-height: 1;
}

.share {
  display: flex;
  gap: 0.5rem;
}

.grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

.block {
  padding: 1.15rem;
}

h2 {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

.seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.seat {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  background: rgba(255, 253, 246, 0.7);
  border: 1px solid rgba(150, 128, 94, 0.28);
}

.seat.empty {
  border-style: dashed;
  background: transparent;
}

.swatch {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 4px;
  border: 2px solid;
  flex: none;
}

.empty-swatch {
  border-color: rgba(150, 128, 94, 0.5);
  background: transparent;
}

.seat-name {
  font-weight: 600;
}

.badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: rgba(150, 128, 94, 0.22);
  color: var(--ink-soft);
}

.badge.you {
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.badge.away {
  background: rgba(120, 120, 120, 0.2);
}

.check {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.55rem;
  font-size: 0.92rem;
  line-height: 1.4;
}

.check.locked {
  opacity: 0.7;
}

.wide {
  width: 100%;
  margin-top: 0.5rem;
}

.centre {
  text-align: center;
  margin: 0.4rem 0 0;
}
</style>
