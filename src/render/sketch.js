import p5 from 'p5';

p5.disableFriendlyErrors = true;
p5.disableSketchChecker = true;
p5.disableParameterValidator = true;
import { MosaicCell } from './mosaic_cell.js';

export function createSketch({
  container,
  seed,
  getStatusText,
  onQueueLength,
  onRenderComplete,
  onAnimationProgress,
} = {}) {
  if (!container) {
    throw new Error('Canvas container is missing.');
  }

  let message = '待機中';
  let buffer = null;
  let drawQueue = [];
  let particles = [];
  let cellsPerFrame = 4000;
  let canvasSize = { width: 640, height: 480 };
  let baseImage = null;
  let cellSizePx = 8;
  let doneExpected = false;
  let lastQueueLength = -1;
  let maskImage = null;
  let maskVisible = false;
  let saveBaseName = 'mask_drift_yolo';
  let particleConfig = {
    cellSize: cellSizePx,
    flowFreq: 0.08,
    flowTwist: 2.0,
    flowZSpeed: 0.1,
    force: 0.2,
    maxSpeed: 1.8,
    moveFrames: 180,
    tileAlpha: 1.0,
    tileShape: 'rect',
    snapToGrid: true,
    wrapEdges: true,
  };
  let flowTime = 0;
  let animationFrame = 0;

  const instance = new p5((p) => {
    p.setup = () => {
      if (Number.isFinite(seed)) {
        p.randomSeed(seed);
        p.noiseSeed(seed);
      }
      const canvas = p.createCanvas(canvasSize.width, canvasSize.height);
      canvas.parent(container);
      p.noStroke();
      buffer = p.createGraphics(canvasSize.width, canvasSize.height);
      buffer.rectMode(p.CENTER);
      buffer.noStroke();
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
        if (particles.length > 0 || drawQueue.length > 0) {
          flowTime += particleConfig.flowZSpeed ?? 0;
        }
        updateParticles(p);
        p.image(buffer, 0, 0);
      }
    };

    p.keyPressed = () => {
      if (p.key !== 's' && p.key !== 'S') return;
      const timestamp = Math.floor(Date.now() / 1000);
      const name = `${saveBaseName}_${timestamp}`;
      p.saveCanvas(name, 'jpg');
    };

    function flushQueue() {
      if (!buffer) return;
      const count = Math.min(cellsPerFrame, drawQueue.length);
      for (let i = 0; i < count; i += 1) {
        const cell = drawQueue.shift();
        particles.push(cell);
      }
      notifyQueueLength();
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
      buffer.rectMode(p.CENTER);
      buffer.noStroke();
      resetBuffer();
    };

    function updateParticles(p5Instance) {
      if (particles.length === 0) {
        checkRenderComplete();
        return;
      }
      animationFrame = Math.min(
        animationFrame + 1,
        Math.max(1, particleConfig.moveFrames ?? animationFrame + 1),
      );
      onAnimationProgress?.({
        frame: animationFrame,
        total: particleConfig.moveFrames ?? animationFrame,
      });
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.step(p5Instance, flowTime, canvasSize);
        if (particle.dead) {
          particles.splice(i, 1);
          continue;
        }
        particle.paint(buffer);
      }
      checkRenderComplete();
    }
  });

  function enqueueCells(cells) {
    const rand =
      typeof instance?.random === 'function'
        ? instance.random.bind(instance)
        : Math.random;
    const nextCells = cells.map(
      (cell) =>
        new MosaicCell({
          ...cell,
          size: cellSizePx,
          cfg: {
            ...particleConfig,
            rand,
          },
        }),
    );
    drawQueue = drawQueue.concat(nextCells);
    notifyQueueLength();
  }

  function clearQueue() {
    drawQueue = [];
    particles = [];
    doneExpected = false;
    flowTime = 0;
    animationFrame = 0;
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
    if (particles.length > 0) return;
    doneExpected = false;
    onRenderComplete?.();
  }

  return {
    instance,
    setMessage(text) {
      message = text;
    },
    setCellSize(size) {
      if (Number.isFinite(size) && size > 0) {
        cellSizePx = size;
        particleConfig = { ...particleConfig, cellSize: size };
      }
    },
    setParticleConfig(config = {}) {
      particleConfig = { ...particleConfig, ...config };
      if (Number.isFinite(particleConfig.cellSize) && particleConfig.cellSize > 0) {
        cellSizePx = particleConfig.cellSize;
      }
      animationFrame = 0;
    },
    resetAnimationFrame() {
      animationFrame = 0;
    },
    setMaskImage,
    setMaskVisible,
    setSaveBaseName(name) {
      if (typeof name === 'string' && name.trim()) {
        saveBaseName = name.trim();
      }
    },
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
