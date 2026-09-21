import { computed, type ComputedRef, type Ref } from 'vue'

import { CHAT_MAX } from '@shared/chat'
import type { ClientMessage, MonopolyClientState } from '@shared/protocol'
import type { TradeSide } from '@shared/monopoly'

/**
 * The slice of the connection store a Monopoly table reads from. The socket and
 * the `monopoly` wire state live in the parent store; this module owns the
 * derived seats and one function per thing a player can do.
 *
 * Every gate here reads the server's `can` block rather than working the rule
 * out again — buildings go up evenly, a group with houses on it cannot be
 * mortgaged, a bid has to beat the standing one. The engine decides all of
 * that, and a button that disagreed with it would only ever offer a move the
 * server was about to refuse.
 */
export interface MonopolyContext {
  monopoly: Ref<MonopolyClientState | null>
  you: ComputedRef<number | null>
  isPaused: ComputedRef<boolean>
  send: (message: ClientMessage) => void
}

export function createMonopoly(ctx: MonopolyContext) {
  const { monopoly, you, isPaused, send } = ctx

  const mpPlayers = computed(() => monopoly.value?.players ?? [])
  const mpYou = computed(() => mpPlayers.value.find((p) => p.id === you.value) ?? null)
  const mpCan = computed(() => monopoly.value?.can ?? null)
  const mpPending = computed(() => monopoly.value?.pending ?? null)
  const mpIsMyTurn = computed(
    () =>
      monopoly.value?.phase === 'play' && you.value !== null && monopoly.value.current === you.value,
  )

  /**
   * The room's talk. Sent only to a seated player, so a spectator's list is
   * empty and the composer below has nothing to send it with.
   */
  const mpChat = computed(() => monopoly.value?.chat ?? [])

  /**
   * Say something. The message is sanitised and length-capped on the server —
   * this only declines to send a line that is empty before it leaves, which is
   * the common case of hitting Enter on an untouched box.
   */
  function mpSay(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return false
    send({ t: 'chat', text: trimmed.slice(0, CHAT_MAX) })
    return true
  }

  /** The one gate every action shares, on top of whatever `can` says. */
  const live = computed(() => monopoly.value?.phase === 'play' && !isPaused.value)

  const mpCanRoll = computed(() => live.value && !!mpCan.value?.roll)
  /** The space on the block, or null when nothing is being offered to you. */
  const mpBuyOffer = computed(() => (live.value ? mpCan.value?.buy ?? null : null))
  const mpCanBid = computed(() => live.value && !!mpCan.value?.bid)
  const mpMinBid = computed(() => mpCan.value?.minBid ?? 0)
  /**
   * The most this seat may bid: the cash in hand, which is public in this game
   * and so needs nothing from the server's `can` block. The engine refuses more
   * than this, so the table must not offer it.
   */
  const mpMaxBid = computed(() => mpYou.value?.cash ?? 0)
  const mpTradeOffered = computed(() => live.value && !!mpCan.value?.trade)
  const mpTradePartners = computed(() => (live.value ? mpCan.value?.partners ?? [] : []))
  const mpInJail = computed(() => live.value && !!mpCan.value?.jail)
  /** What you owe and cannot cover, or null when you are square. */
  const mpDebt = computed(() => (live.value ? mpCan.value?.debt ?? null : null))

  const mpBuildable = computed(() => (live.value ? mpCan.value?.build ?? [] : []))
  const mpSellable = computed(() => (live.value ? mpCan.value?.sell ?? [] : []))
  const mpMortgageable = computed(() => (live.value ? mpCan.value?.mortgage ?? [] : []))
  const mpUnmortgageable = computed(() => (live.value ? mpCan.value?.unmortgage ?? [] : []))

  function mpRoll() {
    if (mpCanRoll.value) send({ t: 'monoRoll' })
  }

  function mpBuy() {
    if (mpBuyOffer.value !== null) send({ t: 'monoBuy' })
  }

  /** Declines both a purchase and a bid — the table only ever has one open. */
  function mpPass() {
    if (mpBuyOffer.value !== null || mpCanBid.value) send({ t: 'monoPass' })
  }

  function mpBid(amount: number) {
    if (!mpCanBid.value) return
    if (amount < mpMinBid.value || amount > mpMaxBid.value) return
    send({ t: 'monoBid', amount })
  }

  function mpOfferTrade(to: number, give: TradeSide, want: TradeSide) {
    if (mpTradePartners.value.includes(to)) send({ t: 'monoTradeOffer', to, give, want })
  }

  function mpAcceptTrade() {
    if (mpTradeOffered.value) send({ t: 'monoTradeAccept' })
  }

  function mpDeclineTrade() {
    if (mpTradeOffered.value) send({ t: 'monoTradeDecline' })
  }

  function mpBuild(space: number) {
    if (mpBuildable.value.includes(space)) send({ t: 'monoBuild', space })
  }

  function mpSell(space: number) {
    if (mpSellable.value.includes(space)) send({ t: 'monoSell', space })
  }

  function mpMortgage(space: number) {
    if (mpMortgageable.value.includes(space)) send({ t: 'monoMortgage', space })
  }

  function mpUnmortgage(space: number) {
    if (mpUnmortgageable.value.includes(space)) send({ t: 'monoUnmortgage', space })
  }

  function mpLeaveJail(choice: 'pay' | 'card' | 'roll') {
    if (mpInJail.value) send({ t: 'monoJail', choice })
  }

  function mpGiveUp() {
    if (mpDebt.value !== null) send({ t: 'monoBankrupt' })
  }

  return {
    mpPlayers,
    mpChat,
    mpSay,
    mpYou,
    mpCan,
    mpPending,
    mpIsMyTurn,
    mpCanRoll,
    mpBuyOffer,
    mpCanBid,
    mpMinBid,
    mpMaxBid,
    mpTradeOffered,
    mpTradePartners,
    mpInJail,
    mpDebt,
    mpBuildable,
    mpSellable,
    mpMortgageable,
    mpUnmortgageable,
    mpRoll,
    mpBuy,
    mpPass,
    mpBid,
    mpOfferTrade,
    mpAcceptTrade,
    mpDeclineTrade,
    mpBuild,
    mpSell,
    mpMortgage,
    mpUnmortgage,
    mpLeaveJail,
    mpGiveUp,
  }
}
