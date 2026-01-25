export class MosaicCell {
  constructor({ x, y, char, active = true, color = null }) {
    this.x = x;
    this.y = y;
    this.char = char;
    this.active = active;
    this.color = color;
  }

  draw(p5Instance) {
    if (!this.active) return;
    if (this.color && Number.isFinite(this.color.r)) {
      p5Instance.fill(this.color.r, this.color.g, this.color.b);
    }
    p5Instance.text(this.char, this.x, this.y);
  }
}
