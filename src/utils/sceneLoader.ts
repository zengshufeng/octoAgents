/**
 * 场景配置加载器：从 JSON 读取并构建 Three.js 场景。
 *
 * 支持：
 *  - 摄像机：perspective / orthographic
 *  - 几何体：box / plane / sphere / cylinder / cone / torus
 *  - 材质：standard / phong / basic / physical（含 transmission）
 *  - 灯光：ambient / hemisphere / directional（含阴影）
 *  - 对象层级树：group / mesh / light，通过 parentId 建立父子关系
 *
 * 用法：通过 URL 参数 ?data=xxx.json 指定数据文件，默认加载 /live-data.json。
 */
import * as THREE from 'three'

const DEG2RAD = Math.PI / 180

// ── 类型 ──────────────────────────────────────────────────

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
    type: 'perspective' | 'orthographic'
    position: number[]
    lookAt: number[]
    perspective?: { fov: number; near: number; far: number }
    orthographic?: {
      left: number; right: number; top: number; bottom: number
      near: number; far: number; zoom?: number
    }
  }
  lights?: Record<string, unknown>[]
  objects?: Record<string, unknown>[]
}

export interface BuiltScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
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

  // 摄像机 —— 支持 perspective / orthographic
  const camCfg = config.camera
  const aspect = viewSize.width / viewSize.height
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera

  if (camCfg.type === 'orthographic' && camCfg.orthographic) {
    const o = camCfg.orthographic
    camera = new THREE.OrthographicCamera(o.left, o.right, o.top, o.bottom, o.near, o.far)
    if (o.zoom) camera.zoom = o.zoom
  } else {
    const p = camCfg.perspective ?? { fov: 50, near: 0.1, far: 100 }
    camera = new THREE.PerspectiveCamera(p.fov, aspect, p.near, p.far)
  }

  camera.position.set(...(camCfg.position.slice(0, 3) as [number, number, number]))
  camera.lookAt(...(camCfg.lookAt.slice(0, 3) as [number, number, number]))
  camera.updateProjectionMatrix()

  // 顶层 lights（仅在 objects 不含 light 时使用，避免重复）
  const hasObjectLights = config.objects?.some((o) =>
    ['ambient', 'hemisphere', 'directional'].includes(o.type as string),
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

    for (const oc of config.objects) {
      const node = createObject3D(oc)
      if (node) nodeMap.set(oc.id as string, node)
    }

    for (const oc of config.objects) {
      const node = nodeMap.get(oc.id as string)
      if (!node) continue
      if (oc.parentId) {
        const parent = nodeMap.get(oc.parentId as string)
        if (parent) parent.add(node)
      } else {
        scene.add(node)
      }
    }
  }

  return { scene, camera }
}

// ── Object3D 工厂 ─────────────────────────────────────────

function createObject3D(cfg: Record<string, unknown>): THREE.Object3D | null {
  const type = cfg.type as string
  let obj: THREE.Object3D | null = null

  switch (type) {
    case 'group':
      obj = new THREE.Group()
      // group 也需要 position / rotation（如 buildingAGroup 的 [-40,0,-65]）
      applyTransform(obj, cfg)
      break
    case 'mesh':
      obj = createMesh(cfg)
      break
    case 'ambient':
    case 'hemisphere':
    case 'directional':
      obj = createLight(cfg)
      break
  }

  return obj
}

// ── Mesh → geometry + material ────────────────────────────

function createMesh(cfg: Record<string, unknown>): THREE.Mesh | null {
  const geometry = cfg.geometry as Record<string, unknown> | undefined
  const material = cfg.material as Record<string, unknown> | undefined
  if (!geometry) return null

  const geo = createGeometry(geometry)
  if (!geo) return null

  const mat = createMaterial(material)

  const mesh = new THREE.Mesh(geo, mat)

  // 位置 / 旋转 / 阴影
  const pos = parseVec3(cfg.position)
  if (pos) mesh.position.set(...pos)
  const rot = parseVec3(cfg.rotation, true)
  if (rot) mesh.rotation.set(...rot)
  if (cfg.castShadow) mesh.castShadow = true
  if (cfg.receiveShadow) mesh.receiveShadow = true

  return mesh
}

function createGeometry(
  geo: Record<string, unknown>,
): THREE.BufferGeometry | null {
  const type = geo.type as string
  const p = geo.params as Record<string, number> | undefined

  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(p?.width ?? 1, p?.height ?? 1, p?.depth ?? 1)
    case 'plane':
      return new THREE.PlaneGeometry(p?.width ?? 1, p?.height ?? 1)
    case 'sphere':
      return new THREE.SphereGeometry(p?.radius ?? 1, p?.widthSegments ?? 32, p?.heightSegments ?? 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(
        p?.radiusTop ?? 1, p?.radiusBottom ?? 1, p?.height ?? 1, p?.radialSegments ?? 32,
      )
    case 'cone':
      return new THREE.ConeGeometry(p?.radius ?? 1, p?.height ?? 1, p?.radialSegments ?? 12)
    case 'torus': {
      const inner = p?.innerRadius ?? 1
      const outer = p?.outerRadius ?? 2
      const radius = (inner + outer) / 2
      const tube = (outer - inner) / 2
      return new THREE.TorusGeometry(radius, tube, undefined, p?.thetaSegments ?? 64)
    }
    default:
      return null
  }
}

function createMaterial(cfg?: Record<string, unknown>): THREE.Material {
  if (!cfg) return new THREE.MeshNormalMaterial()

  const type = cfg.type as string
  let mat: THREE.Material

  switch (type) {
    case 'standard':
      mat = new THREE.MeshStandardMaterial({
        color: (cfg.color as string) ?? '#ffffff',
        roughness: (cfg.roughness as number) ?? 0.5,
        metalness: (cfg.metalness as number) ?? 0,
      })
      break
    case 'phong':
      mat = new THREE.MeshPhongMaterial({
        color: (cfg.color as string) ?? '#ffffff',
      })
      break
    case 'basic':
      mat = new THREE.MeshBasicMaterial({
        color: (cfg.color as string) ?? '#ffffff',
      })
      break
    case 'physical':
      mat = new THREE.MeshPhysicalMaterial({
        color: (cfg.color as string) ?? '#ffffff',
        roughness: (cfg.roughness as number) ?? 0.5,
        metalness: (cfg.metalness as number) ?? 0,
      })
      if (cfg.transmission !== undefined) {
        (mat as THREE.MeshPhysicalMaterial).transmission = cfg.transmission as number
      }
      if (cfg.thickness !== undefined) {
        (mat as THREE.MeshPhysicalMaterial).thickness = cfg.thickness as number
      }
      if (cfg.ior !== undefined) {
        (mat as THREE.MeshPhysicalMaterial).ior = cfg.ior as number
      }
      break
    default:
      return new THREE.MeshNormalMaterial()
  }

  // 透明
  if (cfg.transparent) {
    mat.transparent = true
    if (cfg.opacity !== undefined) mat.opacity = cfg.opacity as number
    if (mat instanceof THREE.MeshPhysicalMaterial && cfg.thickness !== undefined) {
      // transmission 需要 transparent:true（MeshPhysicalMaterial 自动处理）
    }
  }

  return mat
}

// ── Light 工厂 ────────────────────────────────────────────

function createLight(cfg: Record<string, unknown>): THREE.Light | null {
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
      const target = parseVec3(cfg.target)
      if (target) light.target.position.set(...target)
      if (cfg.castShadow) {
        light.castShadow = true
        const shadow = cfg.shadow as Record<string, unknown> | undefined
        if (shadow) {
          if (shadow.mapSize) {
            light.shadow.mapSize.width = shadow.mapSize as number
            light.shadow.mapSize.height = shadow.mapSize as number
          }
          const sc = shadow.camera as Record<string, number> | undefined
          if (sc) {
            light.shadow.camera.near = sc.near
            light.shadow.camera.far = sc.far
            light.shadow.camera.left = sc.left
            light.shadow.camera.right = sc.right
            light.shadow.camera.top = sc.top
            light.shadow.camera.bottom = sc.bottom
            ;(light.shadow.camera as THREE.OrthographicCamera).updateProjectionMatrix()
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

/** 给 Object3D 应用 position / rotation（rotation 按角度→弧度） */
function applyTransform(obj: THREE.Object3D, cfg: Record<string, unknown>): void {
  const pos = parseVec3(cfg.position)
  if (pos) obj.position.set(...pos)
  const rot = parseVec3(cfg.rotation, true)
  if (rot) obj.rotation.set(...rot)
}

/** 把数组或 "[x,y,z]" 字符串解析为三元组 */
function parseVec3(value: unknown, toRadians = false): [number, number, number] | null {
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
  return toRadians
    ? [arr[0] * DEG2RAD, arr[1] * DEG2RAD, arr[2] * DEG2RAD]
    : [arr[0], arr[1], arr[2]]
}
