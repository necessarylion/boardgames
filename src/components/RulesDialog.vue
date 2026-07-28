<script setup lang="ts">
import GameIcon from './GameIcon.vue'
import TileReference from './TileReference.vue'
import { TILES_PER_PLAYER } from '@shared/tiles'
import { CASTES, CASTE_LABEL, CASTE_PIECE_LABEL } from '@shared/types'

defineEmits<{ close: [] }>()
</script>

<template>
  <div class="backdrop" @click.self="$emit('close')">
    <div class="panel sheet">
      <header class="head">
        <h2>How Samurai works</h2>
        <button class="btn ghost small" @click="$emit('close')">Close</button>
      </header>

      <section>
        <h3>The goal</h3>
        <p>
          Capture caste pieces to become the leader of a caste. Whoever leads the most castes wins.
        </p>
        <ul class="castes">
          <li v-for="caste in CASTES" :key="caste">
            <GameIcon :name="caste" :size="20" />
            <span><strong>{{ CASTE_PIECE_LABEL[caste] }}</strong> — {{ CASTE_LABEL[caste] }}</span>
          </li>
        </ul>
      </section>

      <section>
        <h3>Your turn</h3>
        <ol>
          <li>
            Place <strong>one tile</strong> on an empty land space — plus any number of tiles
            marked <strong>速</strong> (fast), in any order. Ship tiles go on sea spaces, and are
            the only tile that can.
          </li>
          <li>Any settlement whose adjacent land spaces are all filled is captured.</li>
          <li>You draw back up to five tiles and your turn ends.</li>
        </ol>
      </section>

      <section>
        <h3>Capturing</h3>
        <p>
          Adjacent sea spaces do not have to be filled. When a settlement is surrounded, each of its
          pieces is contested separately: every player totals the influence of their own tiles
          adjacent to that settlement which match the piece's caste. Wild tiles — samurai, ronin and
          ship — count toward all three castes. The single highest total takes the piece; a tie
          removes it from the game instead.
        </p>
      </section>

      <section>
        <h3>Your {{ TILES_PER_PLAYER }} tiles</h3>
        <p>
          Everyone owns the same set. You pick five to open with, then draw the rest in the order
          they happen to come up. A tile's number is the influence it lends to every settlement it
          touches.
        </p>

        <TileReference />
      </section>

      <section>
        <h3>Ending the game</h3>
        <p>
          The game ends at the end of a turn once every piece of any one caste has left the board, or
          once four pieces have been set aside from ties.
        </p>
        <p>
          Each caste's leader token goes to whoever captured strictly the most of that caste; a tie
          leaves it unclaimed. Most tokens wins. Tied players then compare pieces from the castes
          they do <em>not</em> lead, and after that their total pieces.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(38, 28, 18, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 30;
  backdrop-filter: blur(2px);
}

.sheet {
  width: min(90vw, 100%);
  max-height: 88vh;
  overflow-y: auto;
  padding: 1.4rem 1.75rem 1.8rem;
  box-shadow: var(--shadow-lg);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
  position: sticky;
  top: -1.4rem;
  padding: 0.6rem 0;
  background: linear-gradient(180deg, rgba(250, 245, 236, 0.98), rgba(250, 245, 236, 0.86));
}

h2 {
  font-size: 1.4rem;
}

h3 {
  font-size: 1rem;
  margin: 1rem 0 0.35rem;
  color: var(--vermillion-dark);
}

p,
li {
  line-height: 1.55;
  font-size: 0.92rem;
}

p {
  margin: 0 0 0.5rem;
}

ol {
  margin: 0;
  padding-left: 1.2rem;
}

ol li {
  margin-bottom: 0.3rem;
}

.castes {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.castes li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

</style>
