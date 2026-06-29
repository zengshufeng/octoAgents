<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadSceneConfig, buildSceneFromConfig } from '@/utils/sceneLoader'

const container = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
let scene: THREE.Scene | null = null
let controls: OrbitControls | null = null
let frameId = 0

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
  }
  renderer.setSize(el.clientWidth, el.clientHeight)
}

onMounted(async () => {
  const el = container.value
  if (!el) return

  // 渲染器
  const r = new THREE.WebGLRenderer({ antialias: true })
  r.setSize(el.clientWidth, el.clientHeight)
  r.setPixelRatio(window.devicePixelRatio)
  r.shadowMap.enabled = true
  r.shadowMap.type = THREE.PCFSoftShadowMap
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.toneMappingExposure = 1
  el.appendChild(r.domElement)
  renderer = r

  // 加载场景配置
  let lookAt: [number, number, number] = [0, 0.5, 0]
  try {
    const config = await loadSceneConfig()
    console.log('[场景配置]', config)
    const built = buildSceneFromConfig(config, {
      width: el.clientWidth,
      height: el.clientHeight,
    })
    scene = built.scene
    camera = built.camera
    lookAt = config.camera.lookAt.slice(0, 3) as [number, number, number]
  } catch (err) {
    console.error('[场景加载失败，使用 fallback]', err)
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0e1a)
    camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.1, 1000)
    camera.position.set(2.5, 2.5, 3.5)
    camera.lookAt(...lookAt)
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#B8B8B8', roughness: 0.45 }),
    )
    cube.position.set(0, 0.5, 0)
    cube.castShadow = true
    cube.receiveShadow = true
    scene.add(cube)
    scene.add(new THREE.AmbientLight('#3a4470', 0.18))
  }

  // OrbitControls
  if (camera) {
    controls = new OrbitControls(camera, r.domElement)
    controls.target.set(...lookAt)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
  }

  // 渲染循环
  const animate = () => {
    frameId = requestAnimationFrame(animate)
    controls?.update()
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  animate()

  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  window.removeEventListener('resize', onResize)
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement?.parentNode?.removeChild(renderer.domElement)
  renderer = null
  camera = null
  scene = null
  controls = null
})
</script>

<template>
  <div ref="container" class="three-container" />
</template>

<style scoped>
.three-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.three-container :deep(canvas) {
  display: block;
}
</style>
