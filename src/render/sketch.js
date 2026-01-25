import p5 from 'p5';

p5.disableFriendlyErrors = true;
p5.disableSketchChecker = true;
p5.disableParameterValidator = true;
import { MosaicCell } from './mosaic_cell.js';

export function createSketch({
  container,
  getStatusText,
  onQueueLength,
  onRenderComplete,
} = {}) {
  if (!container) {
    throw new Error('Canvas container is missing.');
  }

  let message = '待機中';
  let buffer = null;
  let drawQueue = [];
  let cellsPerFrame = 2000;
  let canvasSize = { width: 640, height: 480 };
  let baseImage = null;
  let textColor = '#ffffff';
  let cellSizePx = 14;
  let doneExpected = false;
  let lastQueueLength = -1;
  let maskImage = null;
  let maskVisible = false;

  const instance = new p5((p) => {
    p.setup = () => {
      const canvas = p.createCanvas(canvasSize.width, canvasSize.height);
      canvas.parent(container);
      p.textFont('monospace');
      p.textSize(14);
      p.noStroke();
      buffer = p.createGraphics(canvasSize.width, canvasSize.height);
      buffer.textFont('monospace');
      buffer.textSize(cellSizePx);
      buffer.textAlign(p.CENTER, p.CENTER);
      resetBuffer();
    };

    p.draw = () => {
      if (baseImage) {
        p.drawingContext.drawImage(baseImage, 0, 0, canvasSize.width, canvasSize.height);
      } else {
        p.background('#ffffff');
      }
      if (maskVisible && maskImage) {
        p.drawingContext.drawImage(maskImage, 0, 0, canvasSize.width, canvasSize.height);
      }
      if (buffer) {
        flushQueue();
        p.image(buffer, 0, 0);
      }
    };

    function flushQueue() {
      if (!buffer) return;
      const count = Math.min(cellsPerFrame, drawQueue.length);
      buffer.fill(textColor);
      for (let i = 0; i < count; i += 1) {
        const cell = drawQueue.shift();
        cell.draw(buffer);
      }
      notifyQueueLength();
      checkRenderComplete();
    }

    function resetBuffer() {
      if (!buffer) return;
      buffer.clear();
    }

    p.resetBuffer = resetBuffer;
    p.resizeForImage = (width, height) => {
      if (!width || !height) return;
      canvasSize = { width, height };
      p.resizeCanvas(width, height);
      buffer = p.createGraphics(width, height);
      buffer.textFont('monospace');
      buffer.textSize(cellSizePx);
      buffer.textAlign(p.CENTER, p.CENTER);
      resetBuffer();
    };
  });

  function enqueueCells(cells) {
    const nextCells = cells.map((cell) => new MosaicCell(cell));
    drawQueue = drawQueue.concat(nextCells);
    notifyQueueLength();
  }

  function clearQueue() {
    drawQueue = [];
    doneExpected = false;
    notifyQueueLength();
    instance.resetBuffer?.();
  }

  function setBaseImage(image) {
    baseImage = image;
  }

  function setMaskImage(image) {
    maskImage = image;
  }

  function setMaskVisible(visible) {
    maskVisible = !!visible;
  }

  function notifyQueueLength() {
    if (drawQueue.length === lastQueueLength) return;
    lastQueueLength = drawQueue.length;
    onQueueLength?.(drawQueue.length);
  }

  function checkRenderComplete() {
    if (!doneExpected) return;
    if (drawQueue.length > 0) return;
    doneExpected = false;
    onRenderComplete?.();
  }

  return {
    instance,
    setMessage(text) {
      message = text;
    },
    setTextColor(color) {
      if (typeof color === 'string' && color.trim()) {
        textColor = color;
      }
    },
    setCellSize(size) {
      if (Number.isFinite(size) && size > 0) {
        cellSizePx = size;
        if (buffer) {
          buffer.textSize(cellSizePx);
        }
      }
    },
    setMaskImage,
    setMaskVisible,
    setDoneExpected(value) {
      doneExpected = !!value;
      checkRenderComplete();
    },
    setCellsPerFrame(value) {
      cellsPerFrame = value;
    },
    resizeCanvas(width, height) {
      instance.resizeForImage?.(width, height);
    },
    setBaseImage,
    getQueueLength() {
      return drawQueue.length;
    },
    isQueueEmpty() {
      return drawQueue.length === 0;
    },
    enqueueCells,
    clearQueue,
  };
}
