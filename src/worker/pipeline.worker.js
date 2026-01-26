import * as ort from 'onnxruntime-web';

const YOLO_INPUT_SIZE = 640;
const NUM_CLASSES = 80;
const MASK_DIM = 32;
const CONF_THRESHOLD = 0.25;
const NMS_THRESHOLD = 0.5;
const MASK_THRESHOLD = 0.5;
const MAX_DETECTIONS = 100;

let sessionPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function buildMaskOverlayImage(mask, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const v = Math.max(0, Math.min(1, mask[i] ?? 0));
    const idx = i * 4;
    data[idx] = 255;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = Math.round(160 * v);
  }
  return data;
}

function letterboxParams(srcW, srcH, size) {
  const scale = Math.min(size / srcW, size / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((size - newW) / 2);
  const padY = Math.floor((size - newH) / 2);
  return { scale, newW, newH, padX, padY };
}

function preprocessToTensor(image, size) {
  const srcW = image.width || size;
  const srcH = image.height || size;
  const { scale, newW, newH, padX, padY } = letterboxParams(srcW, srcH, size);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2Dコンテキストの取得に失敗しました');

  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, srcW, srcH, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, size, size);
  const { data } = imageData;
  const area = size * size;
  const input = new Float32Array(3 * area);
  for (let i = 0; i < area; i += 1) {
    const idx = i * 4;
    input[i] = data[idx] / 255;
    input[i + area] = data[idx + 1] / 255;
    input[i + area * 2] = data[idx + 2] / 255;
  }

  return {
    tensor: new ort.Tensor('float32', input, [1, 3, size, size]),
    letterbox: { scale, padX, padY, size },
  };
}

function xywhToXyxy(x, y, w, h) {
  const halfW = w / 2;
  const halfH = h / 2;
  return [x - halfW, y - halfH, x + halfW, y + halfH];
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function nms(dets, threshold) {
  const kept = [];
  const sorted = dets.slice().sort((a, b) => b.score - a.score);
  while (sorted.length) {
    const curr = sorted.shift();
    kept.push(curr);
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (iou(curr, sorted[i]) > threshold) {
        sorted.splice(i, 1);
      }
    }
    if (kept.length >= MAX_DETECTIONS) break;
  }
  return kept;
}

function decodeDetections(pred, selected, inputSize) {
  const dims = pred.dims;
  const data = pred.data;
  const count = dims[2];
  const classOffset = 4;
  const coeffOffset = classOffset + NUM_CLASSES;
  const detections = [];

  for (let i = 0; i < count; i += 1) {
    let bestClass = -1;
    let bestScore = 0;
    selected.forEach((classId) => {
      const score = data[(classOffset + classId) * count + i];
      if (score > bestScore) {
        bestScore = score;
        bestClass = classId;
      }
    });
    if (bestScore < CONF_THRESHOLD) continue;

    const x = data[0 * count + i];
    const y = data[1 * count + i];
    const w = data[2 * count + i];
    const h = data[3 * count + i];
    const [x1, y1, x2, y2] = xywhToXyxy(x, y, w, h);

    const coeffs = new Float32Array(MASK_DIM);
    for (let m = 0; m < MASK_DIM; m += 1) {
      coeffs[m] = data[(coeffOffset + m) * count + i];
    }

    detections.push({
      classId: bestClass,
      score: bestScore,
      x1: Math.max(0, Math.min(inputSize, x1)),
      y1: Math.max(0, Math.min(inputSize, y1)),
      x2: Math.max(0, Math.min(inputSize, x2)),
      y2: Math.max(0, Math.min(inputSize, y2)),
      coeffs,
    });
  }

  const byClass = new Map();
  detections.forEach((det) => {
    if (!byClass.has(det.classId)) byClass.set(det.classId, []);
    byClass.get(det.classId).push(det);
  });

  const kept = [];
  byClass.forEach((list) => {
    kept.push(...nms(list, NMS_THRESHOLD));
  });

  kept.sort((a, b) => b.score - a.score);
  return kept.slice(0, MAX_DETECTIONS);
}

function buildUnionMask({
  detections,
  proto,
  inputSize,
  letterbox,
  renderW,
  renderH,
  srcW,
  srcH,
}) {
  if (!detections.length) return { mask: null, width: 0, height: 0 };

  const protoDims = proto.dims;
  const protoData = proto.data;
  const protoH = protoDims[2];
  const protoW = protoDims[3];
  const protoSize = protoH * protoW;

  const unionSmall = new Float32Array(protoSize);

  detections.forEach((det) => {
    const x1m = Math.max(0, Math.floor((det.x1 / inputSize) * protoW));
    const y1m = Math.max(0, Math.floor((det.y1 / inputSize) * protoH));
    const x2m = Math.min(protoW, Math.ceil((det.x2 / inputSize) * protoW));
    const y2m = Math.min(protoH, Math.ceil((det.y2 / inputSize) * protoH));

    for (let y = y1m; y < y2m; y += 1) {
      for (let x = x1m; x < x2m; x += 1) {
        const p = y * protoW + x;
        let sum = 0;
        for (let m = 0; m < MASK_DIM; m += 1) {
          sum += det.coeffs[m] * protoData[m * protoSize + p];
        }
        const value = sigmoid(sum);
        if (value > MASK_THRESHOLD && value > unionSmall[p]) {
          unionSmall[p] = value;
        }
      }
    }
  });

  const inputMask = new Float32Array(inputSize * inputSize);
  for (let y = 0; y < inputSize; y += 1) {
    const my = Math.min(protoH - 1, Math.floor((y / inputSize) * protoH));
    for (let x = 0; x < inputSize; x += 1) {
      const mx = Math.min(protoW - 1, Math.floor((x / inputSize) * protoW));
      inputMask[y * inputSize + x] = unionSmall[my * protoW + mx];
    }
  }

  const { scale, padX, padY } = letterbox;
  const renderScaleX = renderW && srcW ? renderW / srcW : 1;
  const renderScaleY = renderH && srcH ? renderH / srcH : 1;
  const renderMask = new Float32Array(renderW * renderH);
  for (let y = 0; y < renderH; y += 1) {
    for (let x = 0; x < renderW; x += 1) {
      const ix = Math.round(x * (scale / renderScaleX) + padX);
      const iy = Math.round(y * (scale / renderScaleY) + padY);
      if (ix < 0 || iy < 0 || ix >= inputSize || iy >= inputSize) continue;
      renderMask[y * renderW + x] = inputMask[iy * inputSize + ix];
    }
  }

  return { mask: renderMask, width: renderW, height: renderH };
}

async function getSession(modelUrl, wasmBaseUrl) {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = wasmBaseUrl;
    sessionPromise = ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
  }
  return sessionPromise;
}

async function runSegmentation({ image, params, renderW, renderH }) {
  const inputSize = params.inputSize ?? YOLO_INPUT_SIZE;
  const { tensor, letterbox } = preprocessToTensor(image, inputSize);
  const session = await getSession(params.modelPath, params.wasmBaseUrl);
  const feeds = { [session.inputNames[0]]: tensor };
  const outputs = await session.run(feeds);

  let pred = null;
  let proto = null;
  for (const name of session.outputNames) {
    const out = outputs[name];
    if (out.dims.length === 3) pred = out;
    if (out.dims.length === 4) proto = out;
  }
  if (!pred || !proto) {
    throw new Error('YOLO outputs are missing');
  }

  const selected = new Set(params.selectedClassIndices ?? []);
  const detections = decodeDetections(pred, selected, inputSize);
  const union = buildUnionMask({
    detections,
    proto,
    inputSize,
    letterbox,
    renderW,
    renderH,
    srcW: image.width ?? renderW,
    srcH: image.height ?? renderH,
  });

  return union;
}

async function buildMosaicCells({
  runToken,
  width,
  height,
  cellSizePx,
  cellsChunkSize,
  samplesPerCell,
  imageData,
  unionMask,
  maskWidth,
  maskHeight,
  coverageThreshold,
}) {
  const cols = Math.floor(width / cellSizePx);
  const rows = Math.floor(height / cellSizePx);
  const totalCells = cols * rows;
  let done = 0;
  let chunk = [];
  const data = imageData.data;
  const sampleStep = Math.max(1, Math.floor(cellSizePx / samplesPerCell));
  const maskScaleX = maskWidth ? maskWidth / width : 1;
  const maskScaleY = maskHeight ? maskHeight / height : 1;

  postMessage({
    type: 'status',
    runToken,
    payload: {
      stage: 'BUILDING',
      text: 'セル生成中…',
    },
  });

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellSizePx;
      const y = row * cellSizePx;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let samples = 0;
      let coverageSum = 0;

      for (let sy = 0; sy < cellSizePx; sy += sampleStep) {
        for (let sx = 0; sx < cellSizePx; sx += sampleStep) {
          const px = Math.min(width - 1, x + sx);
          const py = Math.min(height - 1, y + sy);
          const idx = (py * width + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          rSum += r;
          gSum += g;
          bSum += b;
          if (unionMask && maskWidth && maskHeight) {
            const mx = Math.min(maskWidth - 1, Math.floor(px * maskScaleX));
            const my = Math.min(maskHeight - 1, Math.floor(py * maskScaleY));
            coverageSum += unionMask[my * maskWidth + mx] ?? 0;
          }
          samples += 1;
        }
      }

      const coverage = samples ? coverageSum / samples : 0;
      const active = unionMask ? coverage >= coverageThreshold : true;
      const color = samples
        ? {
            r: Math.round(rSum / samples),
            g: Math.round(gSum / samples),
            b: Math.round(bSum / samples),
          }
        : null;

      chunk.push({
        x: x + cellSizePx * 0.5,
        y: y + cellSizePx * 0.5,
        active,
        color,
      });
      done += 1;

      if (chunk.length >= cellsChunkSize) {
        if (totalCells > 0) {
          const percent = Math.round((done / totalCells) * 100);
          postMessage({
            type: 'status',
            runToken,
            payload: {
              stage: 'BUILDING',
              text: `セル生成中… ${percent}%`,
            },
          });
        }
        postMessage({
          type: 'cells',
          runToken,
          payload: {
            cells: chunk,
            progress: { done, total: totalCells },
          },
        });
        chunk = [];
        await sleep(0);
      }
    }
  }

  if (chunk.length > 0) {
    postMessage({
      type: 'cells',
      runToken,
      payload: {
        cells: chunk,
        progress: { done: totalCells, total: totalCells },
      },
    });
  }

  postMessage({
    type: 'done',
    runToken,
  });
}

self.onmessage = async (event) => {
  const { data } = event;
  if (!data || data.type !== 'start') return;

  const { runToken, params, image } = data;

  postMessage({
    type: 'status',
    runToken,
    payload: {
      stage: 'LOADING',
      text: '画像読み込み中…',
    },
  });

  await sleep(50);

  const samplesPerCell = params.samplesPerCell ?? 4;

  const srcWidth = image?.width ?? 640;
  const srcHeight = image?.height ?? 480;
  const overrideW = Number.isFinite(params.renderWidth) ? params.renderWidth : null;
  const overrideH = Number.isFinite(params.renderHeight) ? params.renderHeight : null;
  let renderW = overrideW;
  let renderH = overrideH;
  if (!renderW || !renderH) {
    const maxLongEdge = params.maxLongEdge ?? 2560;
    const longEdge = Math.max(srcWidth, srcHeight);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    renderW = Math.max(1, Math.round(srcWidth * scale));
    renderH = Math.max(1, Math.round(srcHeight * scale));
  }

  postMessage({
    type: 'meta',
    runToken,
    payload: { width: renderW, height: renderH },
  });

  const canvas = new OffscreenCanvas(renderW, renderH);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    postMessage({
      type: 'status',
      runToken,
      payload: {
        stage: 'ERROR',
        text: '描画コンテキストの取得に失敗しました',
      },
    });
    return;
  }

  ctx.drawImage(image, 0, 0, renderW, renderH);
  const imageData = ctx.getImageData(0, 0, renderW, renderH);

  let unionMask = null;
  let maskWidth = 0;
  let maskHeight = 0;

  try {
    postMessage({
      type: 'status',
      runToken,
      payload: {
        stage: 'SEGMENTING',
        text: '推論中…',
      },
    });

    const union = await runSegmentation({ image, params, renderW, renderH });
    unionMask = union.mask;
    maskWidth = union.width;
    maskHeight = union.height;
  } catch (error) {
    postMessage({
      type: 'status',
      runToken,
      payload: {
        stage: 'ERROR',
        text: '推論に失敗しました',
      },
    });
    console.error(error);
    return;
  }

  if (params.showMaskOverlay && unionMask && maskWidth && maskHeight) {
    const overlay = buildMaskOverlayImage(unionMask, maskWidth, maskHeight);
    postMessage({
      type: 'mask',
      runToken,
      payload: {
        width: maskWidth,
        height: maskHeight,
        data: overlay,
      },
    }, [overlay.buffer]);
  }

  await buildMosaicCells({
    runToken,
    width: renderW,
    height: renderH,
    cellSizePx: params.cellSizePx,
    cellsChunkSize: params.cellsChunkSize ?? 5000,
    samplesPerCell,
    imageData,
    unionMask,
    maskWidth,
    maskHeight,
    coverageThreshold: params.coverageThreshold ?? 0.2,
  });

  image?.close?.();
};
