import { gsap } from 'gsap'

// =====================
// STYLE
// =====================
document.body.style.margin = 0
document.body.style.background = '#222'
document.body.style.display = 'flex'
document.body.style.justifyContent = 'center'
document.body.style.alignItems = 'center'
document.body.style.height = '100vh'

const container = document.createElement('div')
container.style.display = 'flex'
container.style.gap = '20px'
document.body.appendChild(container)

// =====================
// DIGIT COLUMN
// =====================
class DigitColumn {
  constructor() {
    this.wrapper = document.createElement('div')
    this.wrapper.style.width = '120px'
    this.wrapper.style.height = '160px'
    this.wrapper.style.background = '#fff'
    this.wrapper.style.borderRadius = '20px'
    this.wrapper.style.overflow = 'hidden'
    this.wrapper.style.position = 'relative'
    this.wrapper.style.display = 'flex'
    this.wrapper.style.justifyContent = 'center'
    this.wrapper.style.alignItems = 'center'
    this.wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)'

    // viewport mask (quan trọng)
    this.viewport = document.createElement('div')
    this.viewport.style.height = '100%'
    this.viewport.style.width = '100%'
    this.viewport.style.overflow = 'hidden'
    this.viewport.style.display = 'flex'
    this.viewport.style.justifyContent = 'center'
    this.viewport.style.alignItems = 'center'

    this.inner = document.createElement('div')
    this.inner.style.display = 'flex'
    this.inner.style.flexDirection = 'column'
    this.inner.style.alignItems = 'center'

    this.viewport.appendChild(this.inner)
    this.wrapper.appendChild(this.viewport)

    // tạo số
    this.itemHeight = 160

    for (let i = 0; i < 30; i++) {
      const num = i % 10
      const el = document.createElement('div')

      el.innerText = num
      el.style.height = this.itemHeight + 'px'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
      el.style.fontSize = '90px'
      el.style.fontWeight = 'bold'
      el.style.color = '#000'
      el.style.fontFamily = 'monospace'

      this.inner.appendChild(el)
    }

    // placeholder "-"
    this.placeholder = document.createElement('div')
    this.placeholder.innerText = '-'
    this.placeholder.style.position = 'absolute'
    this.placeholder.style.fontSize = '90px'
    this.placeholder.style.fontWeight = 'bold'
    this.placeholder.style.color = '#000'

    this.wrapper.appendChild(this.placeholder)

    // fix vị trí ban đầu (ẩn số thật đi)
    this.inner.style.transform = `translateY(${-this.itemHeight * 10}px)`
  }

  startSpin(finalNumber) {
    this.placeholder.style.display = 'none'

    const loops = 20
    const finalIndex = loops + finalNumber
    const finalY = -finalIndex * this.itemHeight

    // spin + slow down
    gsap.to(this.inner, {
      y: finalY,
      duration: 3,
      ease: 'power3.out',
      onComplete: () => {
        // bounce nhẹ
        gsap.fromTo(
          this.inner,
          { y: finalY - 20 },
          {
            y: finalY,
            duration: 0.4,
            ease: 'bounce.out'
          }
        )
      }
    })
  }
}

// =====================
// CREATE
// =====================
const cols = [new DigitColumn(), new DigitColumn(), new DigitColumn()]
cols.forEach(c => container.appendChild(c.wrapper))

// =====================
// INTERACTION
// =====================
window.addEventListener('click', () => {
  const result = [
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10),
    Math.floor(Math.random() * 10)
  ]

  cols.forEach((col, i) => {
    setTimeout(() => {
      col.startSpin(result[i])
    }, i * 1200)
  })
})