const COLORS = ["#d7ff3e", "#38e1ff", "#f2f6ff", "#ffd24a", "#ff5470", "#a855f7"];
let canvas = null;
let ctx = null;
let particles = [];
let rafId = null;

function ensureCanvas() {
  if (!canvas) {
    canvas = document.getElementById("confetti-canvas");
    ctx = canvas.getContext("2d");
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function confetti(big = false) {
  ensureCanvas();
  const count = big ? 220 : 90;
  const w = window.innerWidth;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: w * (big ? Math.random() : 0.3 + Math.random() * 0.4),
      y: -20 - Math.random() * (big ? 300 : 120),
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.random() > 0.5 ? "rect" : "circle"
    });
  }

  if (!rafId) rafId = requestAnimationFrame(tick);
}

function tick() {
  if (!ctx) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  particles.forEach(p => {
    p.x += p.vx + Math.sin(p.y * 0.02) * 0.6;
    p.y += p.vy;
    p.rot += p.vr;
    p.vy = Math.min(p.vy + 0.04, 6);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === "rect") {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  particles = particles.filter(p => p.y < window.innerHeight + 40);

  if (particles.length > 0) {
    rafId = requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    rafId = null;
  }
}
