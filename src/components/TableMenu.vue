<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/game'

/**
 * Leaving or ending a game cannot be undone and affects the other players, so
 * each action asks for a second click rather than firing straight away.
 */
const game = useGameStore()
const open = ref(false)
const confirming = ref<'end' | 'leave' | null>(null)

function close() {
  open.value = false
  confirming.value = null
}

function endGame() {
  game.abandonGame()
  close()
}

function leave() {
  game.leaveRoom()
  close()
}
</script>

<template>
  <div class="menu-wrap">
    <button class="btn ghost small" @click="open ? close() : (open = true)">
      Table {{ open ? '▴' : '▾' }}
    </button>

    <div v-if="open" class="backdrop" @click="close" />

    <div v-if="open" class="menu panel">
      <p class="tiny muted head">Room {{ game.state?.code }}</p>

      <template v-if="game.isHost">
        <template v-if="confirming === 'end'">
          <p class="tiny warn">
            End this game for everyone and go back to the lobby? The current board is lost.
          </p>
          <div class="row">
            <button class="btn small" @click="endGame">End game</button>
            <button class="btn ghost small" @click="confirming = null">Cancel</button>
          </div>
        </template>
        <button v-else class="item" @click="confirming = 'end'">
          <span>End game</span>
          <span class="tiny muted">Back to the lobby to deal again</span>
        </button>
      </template>
      <p v-else class="tiny muted item-note">Only the host can end the game.</p>

      <hr class="rule" />

      <template v-if="confirming === 'leave'">
        <p class="tiny warn">Leave the table? You will lose your seat in this game.</p>
        <div class="row">
          <button class="btn small" @click="leave">Leave table</button>
          <button class="btn ghost small" @click="confirming = null">Cancel</button>
        </div>
      </template>
      <button v-else class="item" @click="confirming = 'leave'">
        <span>Leave table</span>
        <span class="tiny muted">Return to the start screen</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu-wrap {
  position: relative;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  z-index: 21;
  width: 15rem;
  padding: 0.6rem;
  box-shadow: var(--shadow-lg);
}

.head {
  margin: 0 0 0.45rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-weight: 600;
  color: var(--ink);
}

.item:hover {
  background: rgba(178, 58, 44, 0.12);
}

.item-note {
  margin: 0.2rem 0.5rem;
}

.warn {
  margin: 0.2rem 0.5rem 0.5rem;
  line-height: 1.45;
  color: var(--vermillion-dark);
}

.row {
  display: flex;
  gap: 0.4rem;
  padding: 0 0.5rem 0.2rem;
}

.rule {
  margin: 0.45rem 0;
}
</style>
