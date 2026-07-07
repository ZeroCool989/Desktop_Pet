import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three-stdlib'
import type { WalkEvent } from '@shared/types'

interface SceneProps {
  talking: boolean
  walk: WalkEvent
  active: boolean
}

interface PantherProps {
  talking: boolean
  walk: WalkEvent
}

/** Latest cursor direction from the main process, shared via ref (no re-renders). */
function useCursorTarget(): React.MutableRefObject<{ dx: number; dy: number }> {
  const target = useRef({ dx: 0, dy: 0 })
  useEffect(
    () =>
      window.panther.onCursor((e) => {
        target.current = e
      }),
    []
  )
  return target
}

/** Caps rendering: invalidates the demand-driven loop at a fixed fps. */
function Ticker({ fps }: { fps: number }): null {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const id = setInterval(() => invalidate(), 1000 / fps)
    return () => clearInterval(id)
  }, [fps, invalidate])
  return null
}

interface Rig {
  head: THREE.Object3D | null
  headBase: THREE.Euler | null
  jaw: THREE.Object3D | null
  jawBase: THREE.Euler | null
  blinks: { mesh: THREE.Mesh; index: number }[]
}

/** Prefer a true "Head" bone over locators like head_end/headfront, then fall back to neck. */
function headScore(name: string): number {
  if (name === 'head') return 3
  if (name.includes('head') && !name.includes('end') && !name.includes('front')) return 2
  if (name.includes('neck')) return 1
  return 0
}

function buildRig(root: THREE.Object3D): Rig {
  let head: THREE.Object3D | null = null
  let bestHead = 0
  let jaw: THREE.Object3D | null = null
  const blinks: { mesh: THREE.Mesh; index: number }[] = []
  root.traverse((o) => {
    const n = o.name.toLowerCase()
    const score = headScore(n)
    if (score > bestHead) {
      bestHead = score
      head = o
    }
    if (!jaw && /jaw|mouth|chin/.test(n)) jaw = o
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (/blink|eyelid|eyesclosed|eye_close/i.test(key)) blinks.push({ mesh, index })
      }
    }
  })
  return {
    head,
    headBase: head ? (head as THREE.Object3D).rotation.clone() : null,
    jaw,
    jawBase: jaw ? (jaw as THREE.Object3D).rotation.clone() : null,
    blinks
  }
}

/** Triangle pulse in [0,1] for a blink that started at `start` and lasts `dur` seconds. */
function blinkAmount(t: number, start: number, dur: number): number {
  const p = (t - start) / dur
  if (p < 0 || p > 1) return 0
  return p < 0.5 ? p * 2 : (1 - p) * 2
}

function findClip(names: string[], patterns: string[]): string | null {
  const lower = names.map((n) => n.toLowerCase())
  for (const p of patterns) {
    const i = lower.findIndex((n) => n.includes(p))
    if (i >= 0) return names[i]
  }
  return null
}

/**
 * Shared procedural life: breathing (when nothing else animates), head tilt
 * toward the OS cursor, blink via morph targets, jaw/head bob while talking.
 */
function useProceduralLife(
  group: React.RefObject<THREE.Group>,
  rig: Rig,
  opts: { talking: boolean; breathe: boolean; bobWhileTalking: boolean }
): void {
  const cursor = useCursorTarget()
  const nextBlink = useRef(2)
  const blinkStart = useRef(-1)
  const smooth = useRef({ dx: 0, dy: 0 })

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const g = group.current
    if (!g) return

    const damp = 1 - Math.exp(-6 * delta)
    smooth.current.dx += (cursor.current.dx - smooth.current.dx) * damp
    smooth.current.dy += (cursor.current.dy - smooth.current.dy) * damp
    const { dx, dy } = smooth.current

    if (opts.breathe) {
      const b = Math.sin(t * 1.6)
      g.position.y = b * 0.015
      g.scale.setScalar(1 + b * 0.008)
    } else {
      g.position.y = 0
      g.scale.setScalar(1)
    }

    const talkBob = opts.talking && opts.bobWhileTalking ? Math.sin(t * 12) : 0

    if (rig.head && rig.headBase) {
      // Runs after the mixer, so the head keeps watching the cursor even mid-clip.
      rig.head.rotation.y = rig.headBase.y + dx * 0.45
      rig.head.rotation.x = rig.headBase.x + dy * 0.3 + talkBob * 0.04
    } else {
      g.rotation.y = dx * 0.3
      g.rotation.x = dy * 0.15 + talkBob * 0.03
    }

    if (opts.talking && opts.bobWhileTalking && rig.jaw && rig.jawBase) {
      rig.jaw.rotation.x = rig.jawBase.x + (Math.sin(t * 12) * 0.5 + 0.5) * 0.28
    } else if (rig.jaw && rig.jawBase) {
      rig.jaw.rotation.x = rig.jawBase.x
    }

    if (rig.blinks.length > 0) {
      if (blinkStart.current < 0 && t >= nextBlink.current) blinkStart.current = t
      if (blinkStart.current >= 0) {
        const amt = blinkAmount(t, blinkStart.current, 0.18)
        for (const { mesh, index } of rig.blinks) {
          if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = amt
        }
        if (t > blinkStart.current + 0.18) {
          blinkStart.current = -1
          nextBlink.current = t + 2 + Math.random() * 4
        }
      }
    }
  })
}

interface LoadedModel {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
}

type Mode = 'talk' | 'walk' | 'idle'

function ModelPanther({
  model,
  talking,
  walk
}: PantherProps & { model: LoadedModel }): JSX.Element {
  const facing = useRef<THREE.Group>(null)
  const group = useRef<THREE.Group>(null)
  const { actions, names } = useAnimations(model.animations, group)

  const clips = useMemo(() => {
    const idle = findClip(names, ['idle', 'breath', 'stand'])
    const talkClip = findClip(names, ['talk', 'speak', 'roar', 'growl'])
    const walkClip = findClip(names, ['walk'])
    const run = findClip(names, ['run', 'sprint'])
    const alert = findClip(names, ['alert', 'attack', 'jump'])
    return {
      idle,
      // An agitated jog beats silence while scolding; walk is the last resort.
      talk: talkClip ?? alert ?? run ?? walkClip,
      walk: walkClip ?? run
    }
  }, [names])

  const rig = useMemo(() => buildRig(model.scene), [model.scene])

  // Normalize unknown model dimensions to fit the tiny stage.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = 1.9 / Math.max(size.x, size.y, size.z, 0.001)
    return {
      scale,
      position: [-center.x * scale, -box.min.y * scale - 1, -center.z * scale] as [
        number,
        number,
        number
      ]
    }
  }, [model.scene])

  const mode: Mode = talking ? 'talk' : walk.walking ? 'walk' : 'idle'

  useEffect(() => {
    const name = clips[mode]
    const action = name ? actions[name] : null
    if (!action) return // no clip for this mode — procedural motion carries it
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [mode, actions, clips])

  // Face the direction of travel while strolling; front-on otherwise.
  useFrame((_, delta) => {
    const f = facing.current
    if (!f) return
    const target = !talking && walk.walking ? walk.dir * (Math.PI / 2) : 0
    f.rotation.y += (target - f.rotation.y) * (1 - Math.exp(-5 * delta))
  })

  useProceduralLife(group, rig, {
    talking,
    breathe: mode === 'idle' && !clips.idle,
    bobWhileTalking: !findClip(names, ['talk', 'speak'])
  })

  return (
    <group ref={facing}>
      <group ref={group}>
        <primitive object={model.scene} scale={fit.scale} position={fit.position} />
      </group>
    </group>
  )
}

/** Stylized low-poly stand-in so the app runs before any .glb exists in assets/. */
function PlaceholderPanther({ talking }: { talking: boolean }): JSX.Element {
  const group = useRef<THREE.Group>(null)
  const headGroup = useRef<THREE.Group>(null)
  const jawGroup = useRef<THREE.Group>(null)

  const rig = useMemo<Rig>(
    () => ({
      head: null,
      headBase: null,
      jaw: null,
      jawBase: null,
      blinks: []
    }),
    []
  )

  // Wire the placeholder's groups into the same procedural rig once mounted.
  useEffect(() => {
    if (headGroup.current && jawGroup.current) {
      rig.head = headGroup.current
      rig.headBase = headGroup.current.rotation.clone()
      rig.jaw = jawGroup.current
      rig.jawBase = jawGroup.current.rotation.clone()
    }
  }, [rig])

  useProceduralLife(group, rig, { talking, breathe: true, bobWhileTalking: true })

  const fur = <meshStandardMaterial color="#15151a" roughness={0.65} metalness={0.1} />

  return (
    <group ref={group} position={[0, -0.4, 0]}>
      {/* body */}
      <mesh position={[0, 0.1, -0.25]} scale={[0.85, 0.62, 1.15]}>
        <sphereGeometry args={[0.7, 24, 18]} />
        {fur}
      </mesh>
      {/* haunches */}
      <mesh position={[0, 0.05, -0.95]} scale={[0.8, 0.7, 0.7]}>
        <sphereGeometry args={[0.6, 20, 16]} />
        {fur}
      </mesh>
      {/* tail */}
      <mesh position={[0.35, 0.5, -1.35]} rotation={[0.9, 0, 0.5]}>
        <cylinderGeometry args={[0.05, 0.08, 1.1, 10]} />
        {fur}
      </mesh>
      {/* front legs */}
      <mesh position={[-0.28, -0.45, 0.25]}>
        <cylinderGeometry args={[0.11, 0.13, 0.7, 10]} />
        {fur}
      </mesh>
      <mesh position={[0.28, -0.45, 0.25]}>
        <cylinderGeometry args={[0.11, 0.13, 0.7, 10]} />
        {fur}
      </mesh>
      {/* head */}
      <group ref={headGroup} position={[0, 0.75, 0.45]}>
        <mesh>
          <sphereGeometry args={[0.42, 24, 18]} />
          {fur}
        </mesh>
        {/* ears */}
        <mesh position={[-0.24, 0.36, 0]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.13, 0.24, 4]} />
          {fur}
        </mesh>
        <mesh position={[0.24, 0.36, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.13, 0.24, 4]} />
          {fur}
        </mesh>
        {/* muzzle */}
        <mesh position={[0, -0.08, 0.36]} scale={[0.55, 0.4, 0.5]}>
          <sphereGeometry args={[0.3, 16, 12]} />
          {fur}
        </mesh>
        {/* eyes */}
        <mesh position={[-0.16, 0.08, 0.36]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial color="#a8ffb0" emissive="#3dff62" emissiveIntensity={1.4} />
        </mesh>
        <mesh position={[0.16, 0.08, 0.36]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial color="#a8ffb0" emissive="#3dff62" emissiveIntensity={1.4} />
        </mesh>
        {/* jaw */}
        <group ref={jawGroup} position={[0, -0.2, 0.25]}>
          <mesh position={[0, -0.03, 0.12]} scale={[0.42, 0.16, 0.45]}>
            <sphereGeometry args={[0.3, 12, 10]} />
            {fur}
          </mesh>
        </group>
      </group>
    </group>
  )
}

function parseGlb(bytes: Uint8Array): Promise<GLTF> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer as ArrayBuffer, '', resolve, reject)
  })
}

function PantherModel({ talking, walk }: PantherProps): JSX.Element | null {
  const [model, setModel] = useState<LoadedModel | 'missing' | null>(null)

  useEffect(() => {
    let cancelled = false
    window.panther
      .readModels()
      .then(async (files) => {
        if (files.length === 0) {
          if (!cancelled) setModel('missing')
          return
        }
        const gltfs = await Promise.all(files.map((f) => parseGlb(f.bytes)))
        if (cancelled) return
        // All files share a rig: first file is the display model, clips are
        // merged from every file (tracks bind to bones by name).
        const seen = new Set<string>()
        const animations = gltfs
          .flatMap((g) => g.animations)
          .filter((clip) => {
            if (seen.has(clip.name)) return false
            seen.add(clip.name)
            return true
          })
        setModel({ scene: gltfs[0].scene as unknown as THREE.Group, animations })
      })
      .catch((err) => {
        console.error('Failed to load models:', err)
        if (!cancelled) setModel('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (model === null) return null
  if (model === 'missing') return <PlaceholderPanther talking={talking} />
  return <ModelPanther model={model} talking={talking} walk={walk} />
}

export default function PantherScene({ talking, walk, active }: SceneProps): JSX.Element {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0.5, 3.4], fov: 35 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ background: 'transparent' }}
    >
      <Ticker fps={active ? 30 : 12} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      {/* rim light so a black panther reads against any wallpaper */}
      <directionalLight position={[-3, 2, -4]} intensity={2.2} color="#7fa8ff" />
      <PantherModel talking={talking} walk={walk} />
    </Canvas>
  )
}
