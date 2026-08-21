export const WHEEL_COLORS = [
  "#d7ff3e", "#38e1ff", "#a855f7", "#ff5470",
  "#ffd24a", "#4ade80", "#f472b6", "#60a5fa"
];

function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0x00ff) + amt));
  return `rgb(${r}, ${g}, ${b})`;
}

export class SpinWheel {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.players = options.players || [];
    this.onFinish = options.onFinish || (() => { });
    this.muted = !!options.muted;

    this.angle = 0;
    this.isSpinning = false;
    this.speed = 0;
    this.friction = 0.9915;
    this.minSpeed = 0.0025;
    this.lastTickIndex = -1;

    this.audioCtx = null;

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        this.resize();
        this.draw();
      });
      this.ro.observe(this.canvas.parentElement);
    } else {
      window.addEventListener("resize", () => {
        this.resize();
        this.draw();
      });
    }
    this.draw();
  }

  setMuted(muted) {
    this.muted = muted;
  }

  resize() {
    const size = this.canvas.parentElement.clientWidth;
    if (!size || size < 10) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  setPlayers(players) {
    this.players = players;
    if (!this.isSpinning) this.draw();
  }

  spin() {
    if (this.isSpinning || this.players.length < 2) return;
    this.isSpinning = true;
    this.lastTickIndex = -1;
    this.speed = 0.32 + Math.random() * 0.18;
    this.ensureAudio();
    this.animate();
  }

  ensureAudio() {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.audioCtx = null;
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playTick() {
    if (this.muted || !this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(gain).connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  playFanfare() {
    if (this.muted || !this.audioCtx) return;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const t = this.audioCtx.currentTime + i * 0.09;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  animate() {
    if (!this.isSpinning) return;

    this.angle += this.speed;
    this.speed *= this.friction;

    const sliceAngle = (Math.PI * 2) / Math.max(this.players.length, 1);
    const pointerAngle = 1.5 * Math.PI;
    const idx = Math.floor((((pointerAngle - this.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / sliceAngle);
    if (idx !== this.lastTickIndex) {
      this.lastTickIndex = idx;
      this.playTick();
    }

    if (this.speed < this.minSpeed) {
      this.isSpinning = false;
      this.speed = 0;
      this.determineWinner();
      return;
    }

    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  draw() {
    const { ctx, size, players, angle } = this;
    if (!ctx || !size) return;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 14;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(215, 255, 62, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (players.length === 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(13, 20, 32, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#8b98ad";
      ctx.font = "700 15px Outfit";
      ctx.textAlign = "center";
      ctx.fillText("Add players to start", centerX, centerY - 8);
      ctx.font = "500 12px Outfit";
      ctx.fillStyle = "rgba(139, 152, 173, 0.6)";
      ctx.fillText("Type names on the left", centerX, centerY + 14);
      return;
    }

    const sliceAngle = (Math.PI * 2) / players.length;

    players.forEach((player, i) => {
      const startA = angle + i * sliceAngle;
      const endA = startA + sliceAngle;
      const color = WHEEL_COLORS[i % WHEEL_COLORS.length];

      const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
      gradient.addColorStop(0, shade(color, -18));
      gradient.addColorStop(1, color);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startA, endA);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 7, 13, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startA + sliceAngle / 2);

      const label = String(player).trim() || `P${i + 1}`;
      let fontSize = Math.min(17, Math.max(11, 340 / players.length));
      ctx.font = `800 ${fontSize}px "Saira Condensed", Outfit`;
      const maxWidth = radius - 52;
      while (ctx.measureText(label).width > maxWidth && fontSize > 8) {
        fontSize -= 1;
        ctx.font = `800 ${fontSize}px "Saira Condensed", Outfit`;
      }

      ctx.fillStyle = "rgba(5, 7, 13, 0.85)";
      ctx.textAlign = "right";
      ctx.fillText(label, radius - 16, 6);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, radius - 17, 5);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, 34, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0f1a";
    ctx.fill();
    ctx.strokeStyle = "rgba(215, 255, 62, 0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#d7ff3e";
    ctx.font = "800 12px 'Saira Condensed', Outfit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("YALLASPIN", centerX, centerY + 1);
    ctx.textBaseline = "alphabetic";
  }

  determineWinner() {
    const sliceAngle = (Math.PI * 2) / this.players.length;
    const normalizedAngle = (1.5 * Math.PI - this.angle) % (Math.PI * 2);
    const positiveAngle = normalizedAngle < 0 ? normalizedAngle + Math.PI * 2 : normalizedAngle;
    const index = Math.floor(positiveAngle / sliceAngle);
    this.draw();
    this.playFanfare();
    this.onFinish(this.players[index]);
  }
}
