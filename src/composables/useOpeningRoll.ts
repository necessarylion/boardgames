import { computed, ref } from 'vue'

import type { Opening } from '@shared/opening'

/**
 * Decide when to replay the opening roll-off.
 *
 * The roll decides nothing: the engine settled the seat at the deal and the
 * answer is already in `current`, so this is a replay of a fact. That is what
 * lets a player who reloads mid-ceremony miss it entirely without the game being
 * any different, and what stops a late-arriving spectator appearing to have a
 * say in it.
 *
 * It is shown once per deal, and only while the game is still untouched — a
 * player who reconnects two turns later must not be shown a ceremony for
 * something the table settled long ago. The key is fingerprinted from the roll
 * itself, so a rematch deals a new one and shows it again.
 */
export function useOpeningRoll(opening: () => Opening | null, fresh: () => boolean) {
  const seen = ref<string | null>(null)

  const key = computed(() => {
    const o = opening()
    if (!o) return null
    const throws = o.rounds.map((r) => r.map((x) => `${x.player}.${x.roll}`).join(',')).join('|')
    return `${o.winner}:${throws}`
  })

  const show = computed(() => !!opening() && fresh() && seen.value !== key.value)

  return { show, dismiss: () => (seen.value = key.value) }
}
