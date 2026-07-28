<script setup lang="ts">
import { onMounted } from 'vue'
import DraftScreen from './components/DraftScreen.vue'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'
import LobbyScreen from './components/LobbyScreen.vue'
import { useGameStore } from './stores/game'

const game = useGameStore()

onMounted(() => game.connect())
</script>

<template>
  <div class="app">
    <p v-if="game.connection !== 'open'" class="connection" :class="game.connection">
      {{
        game.connection === 'connecting'
          ? 'Connecting to the game server…'
          : 'Connection lost — reconnecting…'
      }}
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
