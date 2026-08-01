<script setup lang="ts">
import { computed, onMounted } from 'vue'
import DraftScreen from './components/DraftScreen.vue'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'
import LobbyScreen from './components/LobbyScreen.vue'
import { t } from './i18n'
import { useGameStore } from './stores/game'

const game = useGameStore()

/**
 * Only once there is a table to lose. The first connect runs on load, so on home
 * the bar announced itself on every visit for something the player had not asked
 * for yet; an action attempted before the socket is up says so in a toast.
 */
const showConnection = computed(() => game.inRoom && game.connection !== 'open')

onMounted(() => game.connect())
</script>

<template>
  <div class="app">
    <!-- Taken over by another tab: this one holds still rather than fighting for
         the seat, and offers to take it back. -->
    <p v-if="game.replaced" class="connection">
      {{ t('app.replaced') }}
      <button type="button" class="banner-btn" @click="game.takeOverSeat()">
        {{ t('app.replaced.action') }}
      </button>
    </p>
    <p v-else-if="showConnection" class="connection" :class="game.connection">
      {{ game.connection === 'connecting' ? t('app.connecting') : t('app.connectionLost') }}
    </p>

    <HomeScreen v-if="!game.inRoom" />
    <LobbyScreen v-else-if="game.phase === 'lobby'" />
    <DraftScreen v-else-if="game.phase === 'draft'" />
    <GameScreen v-else />

    <Transition name="toast">
      <p v-if="game.error" class="toast">{{ game.error }}</p>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app > :not(.connection):not(.toast) {
  flex: 1 1 auto;
  min-height: 0;
}

/* Every screen scrolls as a whole except home, which pins its artwork column at
   full height and scrolls only the forms beside it. */
.app > :not(.connection):not(.toast):not(.home) {
  overflow-y: auto;
}

.connection {
  flex: none;
  margin: 0;
  padding: 0.4rem 1rem;
  text-align: center;
  font-size: 0.85rem;
  background: rgba(178, 58, 44, 0.14);
  color: var(--vermillion-dark);
  border-bottom: 1px solid rgba(178, 58, 44, 0.25);
}

.banner-btn {
  margin-left: 0.5rem;
  padding: 0.1rem 0.55rem;
  border-radius: 6px;
  border: 1px solid rgba(178, 58, 44, 0.45);
  background: rgba(255, 252, 245, 0.75);
  color: var(--vermillion-dark);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.banner-btn:hover {
  background: #fff;
}

.connection.connecting {
  background: rgba(150, 128, 94, 0.16);
  color: var(--ink-soft);
  border-bottom-color: rgba(150, 128, 94, 0.3);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  background: #3a2b1c;
  color: #f7efe2;
  box-shadow: var(--shadow-lg);
  font-size: 0.9rem;
  z-index: 60;
  max-width: min(30rem, calc(100vw - 2rem));
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
