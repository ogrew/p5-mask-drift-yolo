export class MosaicCell {
  constructor({ x, y, char, active = true }) {
    this.x = x;
    this.y = y;
    this.char = char;
    this.active = active;
  }

  draw(p5Instance) {
    if (!this.active) return;
    p5Instance.text(this.char, this.x, this.y);
  }
}
