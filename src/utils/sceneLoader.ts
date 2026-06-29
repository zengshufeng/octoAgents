/**
 * 场景配置加载器：从 JSON 读取并构建 Three.js 场景。
 *
 * JSON 格式示例见 public/live-data.json — 含 scene 背景/雾、camera、
 * lights（ambient/hemisphere/directional）、objects 层级树（group/mesh/light）。
 *
 * 用法：通过 URL 参数 ?data=xxx.json 指定数据文件，默认加载 /live-data.json。
 */
import * as THREE from 'three'

const DEG2RAD = Math.PI / 180

// ── 类型定义 ──────────────────────────────────────────────

export interface SceneConfig {
  version: string
  angleUnit: string
  scene: {
    background?: string
    environment?: { preset: string; intensity: number }
    fog?: { type: string; color: string; near: number; far: number }
    renderStyle?: string
  }
  camera: {
    type: string
    position: number[]
    lookAt: number[]
    perspective: { fov: number; near: number; far: number }
  }
  lights?: LightConfig[]
  objects?: ObjectConfig[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightConfig = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ObjectConfig = Record<string, any>

export interface BuiltScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

// ── 加载 ──────────────────────────────────────────────────

/** 从 URL 参数 ?data=xxx 或默认文件加载场景配置 JSON */
export async function loadSceneConfig(defaultFile = 'live-data.json'): Promise<SceneConfig> {
  const params = new URLSearchParams(window.location.search)
  const dataParam = params.get('data')
  const url = dataParam
    ? /^https?:\/\//.test(dataParam)
      ? dataParam
      : `/${dataParam}`
    : `/${defaultFile}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`场景配置加载失败: ${res.status} ${url}`)
  return res.json()
}

// ── 构建 ──────────────────────────────────────────────────

/** 根据配置构建完整的 Three.js 场景树 */
export function buildSceneFromConfig(
  config: SceneConfig,
  viewSize: { width: number; height: number },
): BuiltScene {
  const scene = new THREE.Scene()

  // 背景色
  if (config.scene.background) {
    scene.background = new THREE.Color(config.scene.background)
  }

  // 线性雾
  if (config.scene.fog && config.scene.fog.type === 'linear') {
    const f = config.scene.fog
    scene.fog = new THREE.Fog(f.color, f.near, f.far)
  }

  // 摄像机
  const camCfg = config.camera
  const camera = new THREE.PerspectiveCamera(
    camCfg.perspective.fov,
    viewSize.width / viewSize.height,
    camCfg.perspective.near,
    camCfg.perspective.far,
  )
  camera.position.set(...(camCfg.position.slice(0, 3) as [number, number, number]))
  camera.lookAt(...(camCfg.lookAt.slice(0, 3) as [number, number, number]))

  // 顶层 lights（仅在 objects 不含 light 时使用，避免重复）
  const hasObjectLights = config.objects?.some((o) =>
    ['ambient', 'hemisphere', 'directional'].includes(o.type),
  )
  if (!hasObjectLights && config.lights) {
    for (const lc of config.lights) {
      const light = createLight(lc)
      if (light) scene.add(light)
    }
  }

  // 对象层级树
  if (config.objects) {
    const nodeMap = new Map<string, THREE.Object3D>()

    // 第一遍：创建节点
    for (const oc of config.objects) {
      const node = createObject3D(oc)
      if (node) nodeMap.set(oc.id, node)
    }

    // 第二遍：挂载到父节点
    for (const oc of config.objects) {
      const node = nodeMap.get(oc.id)
      if (!node) continue
      if (oc.parentId) {
        const parent = nodeMap.get(oc.parentId)
        if (parent) parent.add(node)
      } else {
        scene.add(node)
      }
    }
  }

  return { scene, camera }
}

// ── 内部：创建各类 Object3D ───────────────────────────────

function createObject3D(cfg: ObjectConfig): THREE.Object3D | null {
  switch (cfg.type) {
    case 'group':
      return new THREE.Group()
    case 'mesh':
      return createMesh(cfg)
    case 'ambient':
    case 'hemisphere':
    case 'directional':
      return createLight(cfg)
    default:
      return null
  }
}

function createMesh(cfg: ObjectConfig): THREE.Mesh | null {
  const geometry = cfg.geometry as Record<string, unknown> | undefined
  const material = cfg.material as Record<string, unknown> | undefined
  if (!geometry) return null

  // 几何体
  let geo: THREE.BufferGeometry
  const geoType = geometry.type as string
  const p = geometry.params as Record<string, number> | undefined

  switch (geoType) {
    case 'box':
      geo = new THREE.BoxGeometry(p?.width ?? 1, p?.height ?? 1, p?.depth ?? 1)
      break
    case 'plane':
      geo = new THREE.PlaneGeometry(p?.width ?? 1, p?.height ?? 1)
      break
    case 'sphere':
      geo = new THREE.SphereGeometry(
        p?.radius ?? 1,
        p?.widthSegments ?? 32,
        p?.heightSegments ?? 16,
      )
      break
    case 'cylinder':
      geo = new THREE.CylinderGeometry(
        p?.radiusTop ?? 1,
        p?.radiusBottom ?? 1,
        p?.height ?? 1,
        p?.segments ?? 32,
      )
      break
    default:
      return null
  }

  // 材质
  let mat: THREE.Material = new THREE.MeshNormalMaterial()
  if (material) {
    const matType = material.type as string
    switch (matType) {
      case 'standard':
        mat = new THREE.MeshStandardMaterial({
          color: (material.color as string) ?? '#ffffff',
          roughness: (material.roughness as number) ?? 0.5,
          metalness: (material.metalness as number) ?? 0,
        })
        break
      case 'phong':
        mat = new THREE.MeshPhongMaterial({
          color: (material.color as string) ?? '#ffffff',
        })
        break
      case 'basic':
        mat = new THREE.MeshBasicMaterial({
          color: (material.color as string) ?? '#ffffff',
        })
        break
    }
  }

  const mesh = new THREE.Mesh(geo, mat)

  // 位置 / 旋转（角度转弧度）/ 阴影
  const pos = parseVec3(cfg.position)
  if (pos) mesh.position.set(...pos)
  const rot = parseVec3(cfg.rotation, true)
  if (rot) mesh.rotation.set(...rot)
  if (cfg.castShadow) mesh.castShadow = true
  if (cfg.receiveShadow) mesh.receiveShadow = true

  return mesh
}

function createLight(cfg: LightConfig): THREE.Light | null {
  const type = cfg.type as string
  const color = cfg.color as string | undefined
  const intensity = (cfg.intensity as number) ?? 1
  const pos = parseVec3(cfg.position)

  switch (type) {
    case 'ambient':
      return new THREE.AmbientLight(color ?? '#ffffff', intensity)

    case 'hemisphere': {
      const sky = (cfg.skyColor as string) ?? color ?? '#ffffff'
      const ground = (cfg.groundColor as string) ?? '#222222'
      const light = new THREE.HemisphereLight(sky, ground, intensity)
      if (pos) light.position.set(...pos)
      return light
    }

    case 'directional': {
      const light = new THREE.DirectionalLight(color ?? '#ffffff', intensity)
      if (pos) light.position.set(...pos)
      // 目标点
      const target = parseVec3(cfg.target)
      if (target) light.target.position.set(...target)
      // 阴影
      if (cfg.castShadow) {
        light.castShadow = true
        const shadow = cfg.shadow as Record<string, unknown> | undefined
        if (shadow) {
          if (shadow.mapSize) light.shadow.mapSize.setScalar(shadow.mapSize as number)
          const sc = shadow.camera as Record<string, number> | undefined
          if (sc) {
            light.shadow.camera.near = sc.near
            light.shadow.camera.far = sc.far
            light.shadow.camera.left = sc.left
            light.shadow.camera.right = sc.right
            light.shadow.camera.top = sc.top
            light.shadow.camera.bottom = sc.bottom
            light.shadow.camera.updateProjectionMatrix()
          }
        }
      }
      return light
    }

    default:
      return null
  }
}

// ── 工具 ──────────────────────────────────────────────────

/** 把数组或 "[x,y,z]" 字符串解析为三元组，toRadians 会将角度转为弧度 */
function parseVec3(
  value: unknown,
  toRadians = false,
): [number, number, number] | null {
  let arr: number[] | null = null

  if (Array.isArray(value) && value.length >= 3) {
    arr = value.slice(0, 3).map(Number)
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length >= 3) {
        arr = parsed.slice(0, 3).map(Number)
      }
    } catch {
      return null
    }
  }

  if (!arr) return null

  if (toRadians) {
    return [arr[0] * DEG2RAD, arr[1] * DEG2RAD, arr[2] * DEG2RAD]
  }
  return [arr[0], arr[1], arr[2]]
}
