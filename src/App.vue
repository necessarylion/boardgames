<script setup lang="ts">
import { computed, onMounted } from 'vue'
import CarnivalGameScreen from './components/carnivals/CarnivalGameScreen.vue'
import CarnivalLobby from './components/carnivals/CarnivalLobby.vue'
import CopGameScreen from './components/cop/CopGameScreen.vue'
import CopLobby from './components/cop/CopLobby.vue'
import CoupGameScreen from './components/coup/CoupGameScreen.vue'
import CoupLobby from './components/coup/CoupLobby.vue'
import DiceRoll from './components/common/DiceRoll.vue'
import DraftScreen from './components/samurai/DraftScreen.vue'
import GameScreen from './components/samurai/GameScreen.vue'
import HalliGameScreen from './components/halli_galli/HalliGameScreen.vue'
import HalliLobby from './components/halli_galli/HalliLobby.vue'
import HomeScreen from './components/common/HomeScreen.vue'
import LandingScreen from './components/common/LandingScreen.vue'
import LobbyScreen from './components/samurai/LobbyScreen.vue'
import SnakeGameScreen from './components/snake/SnakeGameScreen.vue'
import SnakeLobby from './components/snake/SnakeLobby.vue'
import { useOpeningRoll } from './composables/useOpeningRoll'
import { t } from './i18n'
import { useGameStore } from './stores/game'

const game = useGameStore()

/**
 * Only once there is a table to lose. The first connect runs on load, so on home
 * the bar announced itself on every visit for something the player had not asked
 * for yet; an action attempted before the socket is up says so in a toast.
 */
const showConnection = computed(() => game.inRoom && game.connection !== 'open' && !game.stale)

const reload = () => location.reload()

/*
 * The opening roll belongs to no one game, so it is replayed here rather than in
 * each of the three tables — which also means it shows over Samurai's draft, the
 * one screen where knowing the turn order actually changes what you pick.
 */
const opening = useOpeningRoll(
  () => game.room?.opening ?? null,
  () => {
    const room = game.room
    if (!room || room.phase === 'lobby' || room.phase === 'over') return false
    return room.turnNumber <= 1
  },
)

onMounted(() => game.connect())
</script>

<template>
  <div class="app">
    <!-- Taken over by another tab: this one holds still rather than fighting for
         the seat, and offers to take it back. -->
    <!-- Older than the server: retrying cannot help, only a reload can. -->
    <p v-if="game.stale" class="connection">
      {{ t('app.stale') }}
      <button type="button" class="banner-btn" @click="reload()">
        {{ t('app.stale.action') }}
      </button>
    </p>
    <p v-else-if="game.replaced" class="connection">
      {{ t('app.replaced') }}
      <button type="button" class="banner-btn" @click="game.takeOverSeat()">
        {{ t('app.replaced.action') }}
      </button>
    </p>
    <p v-else-if="showConnection" class="connection" :class="game.connection">
      {{ game.connection === 'connecting' ? t('app.connecting') : t('app.connectionLost') }}
    </p>

    <!-- Not at a table: land on the game chooser, then that game's home form. -->
    <LandingScreen v-if="!game.inRoom && !game.chosenGame" />
    <HomeScreen v-else-if="!game.inRoom" />

    <!-- The card games have a lobby and a table each; Samurai keeps its three. -->
    <template v-else-if="game.kind === 'halligalli'">
      <HalliLobby v-if="game.phase === 'lobby'" />
      <HalliGameScreen v-else />
    </template>

    <template v-else-if="game.kind === 'coup'">
      <CoupLobby v-if="game.phase === 'lobby'" />
      <CoupGameScreen v-else />
    </template>

    <template v-else-if="game.kind === 'carnivals'">
      <CarnivalLobby v-if="game.phase === 'lobby'" />
      <CarnivalGameScreen v-else />
    </template>

    <template v-else-if="game.kind === 'cop'">
      <CopLobby v-if="game.phase === 'lobby'" />
      <CopGameScreen v-else />
    </template>

    <template v-else-if="game.kind === 'snake'">
      <SnakeLobby v-if="game.phase === 'lobby'" />
      <SnakeGameScreen v-else />
    </template>

    <LobbyScreen v-else-if="game.phase === 'lobby'" />
    <DraftScreen v-else-if="game.phase === 'draft'" />
    <GameScreen v-else />

    <DiceRoll
      v-if="opening.show.value && game.room?.opening"
      :opening="game.room.opening"
      :players="game.room.players"
      @done="opening.dismiss()"
    />

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

/* Every screen scrolls as a whole except home and the Samurai lobby, which pin
   one column at full height and scroll only the other beside it. */
.app > :not(.connection):not(.toast):not(.home):not(.lobby-split) {
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
