import * as THREE from 'three'
import { gsap } from 'gsap'

// IMPORTANT: phải có .js
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// =====================
// BASIC HTML SETUP
// =====================
document.body.style.margin = 0
document.body.style.overflow = 'hidden'

// =====================
// SCENE
// =====================
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)
camera.position.set(0, 0, 8)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// =====================
// LIGHT
// =====================
const ambient = new THREE.AmbientLight(0xffffff, 0.2)
scene.add(ambient)

const point = new THREE.PointLight(0x00ffcc, 3, 20)
point.position.set(0, 2, 5)
scene.add(point)

// =====================
// BLOOM
// =====================
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.8,
  0.4,
  0.85
)
composer.addPass(bloom)

// =====================
// DIGIT COLUMN
// =====================
class DigitColumn {
  constructor(x) {
    this.group = new THREE.Group()
    this.group.position.x = x

    this.speed = 0
    this.isSpinning = false

    this.createDigits()
  }

    createDigits() {
    for (let i = 0; i < 20; i++) {
        const num = i % 10

        const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(`hsl(${num * 36}, 100%, 50%)`),
        emissive: new THREE.Color(`hsl(${num * 36}, 100%, 50%)`),
        emissiveIntensity: 1.5,
        wireframe: false
        })

        const geo = new THREE.BoxGeometry(
        0.6 + num * 0.03,  // mỗi số size khác nhau
        1,
        0.2
        )

        const mesh = new THREE.Mesh(geo, material)

        mesh.position.y = -i * 1.2

        this.group.add(mesh)
    }
    }

  start() {
    this.isSpinning = true
    this.speed = 0.6 + Math.random() * 0.3
  }

  stop(num) {
    this.isSpinning = false

    const targetIndex = num + 10
    const targetY = -targetIndex * 1.2

    gsap.to(this.group.position, {
      y: targetY,
      duration: 1.2,
      ease: "power3.out"
    })
  }

  update() {
    this.group.position.y -= this.speed * 1.5
    if (this.isSpinning) {
      this.group.position.y -= this.speed

      if (this.group.position.y < -12) {
        this.group.position.y = 0
      }
    }
  }
}

// =====================
// CREATE COLUMNS
// =====================
const columns = [
  new DigitColumn(-1.5),
  new DigitColumn(0),
  new DigitColumn(1.5)
]

columns.forEach(c => scene.add(c.group))

// =====================
// CLICK TO SPIN
// =====================
window.addEventListener('click', () => {
  columns.forEach(c => c.start())

  setTimeout(() => {
    const result = [
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10)
    ]

    columns.forEach((c, i) => {
      setTimeout(() => c.stop(result[i]), i * 200)
    })
  }, 2000)
})

// =====================
// RESIZE
// =====================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// =====================
// LOOP
// =====================
function animate() {
  requestAnimationFrame(animate)

  columns.forEach(c => c.update())

  composer.render()
}

animate()