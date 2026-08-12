/** Small seeded PRNG so a game can be replayed from its seed. */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 1
  }

  /**
   * Where the generator has got to. Samurai and Halli Galli shuffle once, at the
   * deal, so their seed is enough to replay them; Coup reshuffles its court deck
   * every time a challenge is won, so it stores this back into its state and
   * resumes from here rather than replaying from the original seed.
   */
  get position(): number {
    return this.state
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 0x100000000
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive)
  }

  shuffle<T>(items: T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
