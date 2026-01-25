export class MosaicCell {
  constructor({ x, y, char, active = true, color = null, size = 10, cfg = {} }) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.char = char;
    this.active = active;
    this.color = color;
    this.cfg = cfg;

    this.r = color?.r ?? 255;
    this.g = color?.g ?? 255;
    this.b = color?.b ?? 255;

    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a);
    this.vy = Math.sin(a);
    this.ax = 0;
    this.ay = 0;

    this.age = 0;
    this.life = Math.max(1, cfg.moveFrames ?? 180);
    this.forceScale = 0.6 + Math.random() * 0.8;
    this.maxSpeedScale = 0.7 + Math.random() * 0.6;
    this.fade = 255;
    this.dead = false;
  }

  step(p5Instance, t, bounds) {
    if (this.dead) return;
    if (this.age >= this.life) {
      this.dead = true;
      return;
    }
    this.age += 1;

    const c = this.cfg.cellSize ?? this.size;
    const cx = Math.floor(this.x / c);
    const cy = Math.floor(this.y / c);

    const n = p5Instance.noise(
      cx * (this.cfg.flowFreq ?? 0.08),
      cy * (this.cfg.flowFreq ?? 0.08),
      t,
    );
    const angle = n * Math.PI * 2 * (this.cfg.flowTwist ?? 2.0);

    const force = (this.cfg.force ?? 0.2) * this.forceScale;
    this.ax += Math.cos(angle) * force;
    this.ay += Math.sin(angle) * force;

    this.vx += this.ax;
    this.vy += this.ay;

    const targetAlpha = 255 * (this.cfg.tileAlpha ?? 1);
    const ratio = this.age / this.life;
    this.fade = 255 + (targetAlpha - 255) * ratio;

    const sp = Math.hypot(this.vx, this.vy);
    const maxSp = (this.cfg.maxSpeed ?? 2.8) * this.maxSpeedScale;
    if (sp > maxSp) {
      const k = maxSp / sp;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx;
    this.y += this.vy;

    this.ax = 0;
    this.ay = 0;

    const width = bounds?.width ?? 0;
    const height = bounds?.height ?? 0;
    if (this.cfg.wrapEdges) {
      if (this.x < 0) this.x += width;
      if (this.x >= width) this.x -= width;
      if (this.y < 0) this.y += height;
      if (this.y >= height) this.y -= height;
    } else if (this.x < 0 || this.x >= width || this.y < 0 || this.y >= height) {
      this.dead = true;
    }
  }

  paint(p5Instance) {
    if (!this.active || this.dead) return;
    p5Instance.fill(this.r, this.g, this.b, this.fade);

    let px = this.x;
    let py = this.y;
    if (this.cfg.snapToGrid) {
      px = Math.floor(this.x / this.size) * this.size + this.size * 0.5;
      py = Math.floor(this.y / this.size) * this.size + this.size * 0.5;
    }

    if (this.cfg.tileShape === 'circle') {
      p5Instance.circle(px, py, this.size);
    } else if (this.cfg.tileShape === 'rect') {
      p5Instance.rect(px, py, this.size, this.size);
    }

  }
}
