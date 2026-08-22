<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * A six-sided die thrown in 3D. The throw is a real rigid-body tumble (cannon-es)
 * rendered with three.js, but the result is never left to the physics: the
 * server already decided the throw. The whole tumble is simulated up front, the
 * face that happens to land upwards is read off, and the pips are assigned so
 * that face shows `face` — then the recorded tumble is replayed over `durationMs`.
 */
const props = withDefaults(
  defineProps<{
    /** The face to show — the throw's result, or the last throw while idle. */
    face: number
    /** Bump to throw; the die lands on `face`. */
    rollKey: number
    durationMs?: number
    size?: number
  }>(),
  { durationMs: 2000, size: 160 },
)

const canvas = ref<HTMLCanvasElement | null>(null)

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

const DIE = 1.2
const HALF = DIE / 2
const SIM_HZ = 60
const MAX_FRAMES = 240
/** A throw shorter than this is re-thrown harder, so the die tumbles for the whole roll. */
const MIN_FRAMES = 105

/** One pip face, drawn on a canvas. */
function faceTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#fffaf0'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#1c1613'
  for (const [px, py] of PIPS[n]) {
    g.beginPath()
    g.arc(32 + px * 32, 32 + py * 32, 11, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** BoxGeometry material order: +x, -x, +y, -y, +z, -z. */
const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
]
const OPPOSITE = [1, 0, 3, 2, 5, 4]

/** Pip materials so that material slot `upSlot` shows `face`, opposites summing to seven. */
function assignFaces(upSlot: number, face: number): number[] {
  const faces = new Array<number>(6).fill(0)
  faces[upSlot] = face
  faces[OPPOSITE[upSlot]] = 7 - face
  const pairs = [[1, 6], [2, 5], [3, 4]].filter(([a]) => a !== face && a !== 7 - face)
  const free = [0, 2, 4].filter((s) => s !== upSlot && s !== OPPOSITE[upSlot])
  free.forEach((slot, i) => {
    faces[slot] = pairs[i][0]
    faces[OPPOSITE[slot]] = pairs[i][1]
  })
  return faces
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let die: THREE.Mesh
let materials: THREE.MeshStandardMaterial[]
const textures = new Map<number, THREE.CanvasTexture>()
let raf = 0

const textureOf = (n: number) => {
  let t = textures.get(n)
  if (!t) textures.set(n, (t = faceTexture(n)))
  return t
}

function setFaces(faces: number[]) {
  faces.forEach((n, i) => {
    materials[i].map = textureOf(n)
    materials[i].needsUpdate = true
  })
}

function render() {
  renderer?.render(scene, camera)
}

/** Drop the die flat with `face` up, no tumble — the idle state. */
function rest(face: number) {
  die.position.set(0, HALF, 0)
  die.quaternion.identity()
  setFaces(assignFaces(2, face))
  render()
}

type Throw = { frames: { p: CANNON.Vec3; q: CANNON.Quaternion }[]; upSlot: number }

/** Throw until the tumble lasts long enough to fill the roll; keep the longest otherwise. */
function simulate(): Throw {
  let best: Throw | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const t = simulateOnce(1 + attempt * 0.25)
    if (t.frames.length >= MIN_FRAMES) return t
    if (!best || t.frames.length > best.frames.length) best = t
  }
  return best!
}

/** Simulate a whole throw and return each frame's position and rotation. */
function simulateOnce(energy: number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) })
  world.allowSleep = true
  const mat = new CANNON.Material()
  world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.25, restitution: 0.5 }))

  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mat })
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(floor)
  // Walls keep the die in frame; the camera never sees them.
  // Well inside the camera's view, so a die that rolls to the wall is still whole on screen.
  const bound = 1.45
  for (const [x, z, ry] of [
    [bound, 0, -Math.PI / 2],
    [-bound, 0, Math.PI / 2],
    [0, bound, Math.PI],
    [0, -bound, 0],
  ]) {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mat })
    wall.position.set(x, 0, z)
    wall.quaternion.setFromEuler(0, ry, 0)
    world.addBody(wall)
  }

  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
    material: mat,
    linearDamping: 0.15,
    angularDamping: 0.15,
    sleepSpeedLimit: 0.15,
    sleepTimeLimit: 0.3,
  })
  const r = (n: number) => (Math.random() * 2 - 1) * n
  body.position.set(r(0.7), 3.4, r(0.7))
  body.quaternion.setFromEuler(r(Math.PI), r(Math.PI), r(Math.PI))
  body.velocity.set((-body.position.x * 2 + r(3)) * energy, -3 * energy, (-body.position.z * 2 + r(3)) * energy)
  body.angularVelocity.set(r(20) * energy, r(20) * energy, r(20) * energy)
  world.addBody(body)

  const frames: { p: CANNON.Vec3; q: CANNON.Quaternion }[] = []
  for (let i = 0; i < MAX_FRAMES; i++) {
    world.step(1 / SIM_HZ)
    frames.push({ p: body.position.clone(), q: body.quaternion.clone() })
    if (body.sleepState === CANNON.Body.SLEEPING) break
  }

  // Which local face ended up pointing at the sky.
  const q = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
  let upSlot = 2
  let best = -Infinity
  AXES.forEach((axis, i) => {
    const d = axis.clone().applyQuaternion(q).y
    if (d > best) {
      best = d
      upSlot = i
    }
  })

  // A die can stop leaning on a wall or an edge, with no face truly up. The
  // last few frames ease it onto that nearest face, flat on the floor and clear
  // of the walls, so what is shown is always a clean landing.
  const worldUp = AXES[upSlot].clone().applyQuaternion(q).normalize()
  const flat = new THREE.Quaternion().setFromUnitVectors(worldUp, new THREE.Vector3(0, 1, 0)).multiply(q)
  const lastFrame = frames[frames.length - 1]
  const keep = bound - HALF - 0.1
  const target = new THREE.Vector3(
    Math.max(-keep, Math.min(keep, lastFrame.p.x)),
    HALF,
    Math.max(-keep, Math.min(keep, lastFrame.p.z)),
  )
  const from = new THREE.Vector3(lastFrame.p.x, lastFrame.p.y, lastFrame.p.z)
  const SETTLE = 10
  for (let i = 1; i <= SETTLE; i++) {
    const k = i / SETTLE
    const pos = from.clone().lerp(target, k)
    const rot = q.clone().slerp(flat, k)
    frames.push({ p: new CANNON.Vec3(pos.x, pos.y, pos.z), q: new CANNON.Quaternion(rot.x, rot.y, rot.z, rot.w) })
  }
  return { frames, upSlot }
}

function throwDie(face: number) {
  if (!renderer) return
  cancelAnimationFrame(raf)
  const { frames, upSlot } = simulate()
  setFaces(assignFaces(upSlot, face))
  const start = performance.now()
  const last = frames.length - 1
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / props.durationMs)
    const f = frames[Math.min(last, Math.floor(t * last))]
    die.position.set(f.p.x, f.p.y, f.p.z)
    die.quaternion.set(f.q.x, f.q.y, f.q.z, f.q.w)
    render()
    if (t < 1) raf = requestAnimationFrame(tick)
    else raf = 0
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  if (!canvas.value) return
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true })
  } catch {
    // No WebGL (a test runner, an old browser): the tray simply shows no die.
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(props.size, props.size, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
  camera.position.set(0, 6.2, 4.6)
  camera.lookAt(0, 0.3, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(3, 8, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)

  // The die casts onto an otherwise invisible floor, so the tumble reads as
  // happening on the table rather than floating in the sidebar.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.28 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  materials = AXES.map(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }))
  die = new THREE.Mesh(new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.14), materials)
  die.castShadow = true
  scene.add(die)

  rest(props.face)
})

watch(
  () => props.rollKey,
  () => throwDie(props.face),
)
watch(
  () => props.face,
  (face) => {
    if (renderer && !raf) rest(face)
  },
)

onUnmounted(() => {
  cancelAnimationFrame(raf)
  renderer?.dispose()
  for (const t of textures.values()) t.dispose()
})
</script>

<template>
  <canvas ref="canvas" class="die3d" :width="size" :height="size" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>

<style scoped>
.die3d {
  display: block;
}
</style>
