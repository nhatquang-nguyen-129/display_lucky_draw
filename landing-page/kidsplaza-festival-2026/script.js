document.addEventListener("DOMContentLoaded", () => {
  const names = ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C"];
  const slot = document.getElementById("slot");
  const btn = document.getElementById("spinBtn");

  const canvas = document.getElementById("firework");
  const ctx = canvas.getContext("2d");

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let spinning = false;
  let fireworks = [];

  btn.addEventListener("click", () => {
    if (spinning) return;
    spinning = true;

    slot.className = "slot";
    let i = 0;

    const interval = setInterval(() => {
      slot.textContent = names[i % names.length];
      i++;
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      const winner = names[Math.floor(Math.random() * names.length)];
      showWinner(winner);
      launchFireworks();
      spinning = false;
    }, 3000);
  });

  function showWinner(name) {
    slot.textContent = name;
    slot.classList.add("winner", "impact");

    setTimeout(() => {
      slot.classList.remove("impact");
    }, 500);
  }

  /* FIREWORK LOGIC */
  function launchFireworks() {
    fireworks = [];

    for (let i = 0; i < 6; i++) {
      createFirework();
    }

    let duration = 0;
    const timer = setInterval(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      updateFireworks();
      duration += 16;
      if (duration > 2500) {
        clearInterval(timer);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 16);
  }

  function createFirework() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height * 0.5;

    for (let i = 0; i < 40; i++) {
      fireworks.push({
        x,
        y,
        vx: Math.cos(i) * Math.random() * 4,
        vy: Math.sin(i) * Math.random() * 4,
        alpha: 1,
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
      });
    }
  }

  function updateFireworks() {
    fireworks.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.02;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    fireworks = fireworks.filter(p => p.alpha > 0);
    ctx.globalAlpha = 1;
  }
});