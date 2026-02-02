import './style.css';
import { AppState, RunStage } from './shared/constants.js';
import { setupPanes } from './ui/panes.js';
import { createSketch } from './render/sketch.js';
import { loadCocoLabels } from './shared/coco_labels.js';

const canvasContainer = document.querySelector('#canvas-wrap');
const viewportContainer = document.querySelector('#stage');
const emptyState = document.querySelector('#empty-state');
const appBaseUrl = new URL(import.meta.env.BASE_URL || '/', window.location.href);

let currentState = AppState.IDLE;
let currentStage = RunStage.NONE;
let statusText = '待機中';
let worker = null;
let runToken = 0;
let pendingParams = null;
let panes = null;
let displayBitmap = null;
let animationActive = false;
let previewToken = 0;
let lastPreviewSample = null;
const sessionSeed = Math.floor(Math.random() * 1e9);

const sketch = createSketch({
  container: canvasContainer,
  seed: sessionSeed,
  getStatusText: () => statusText,
  onAnimationProgress: ({ frame, total }) => {
    if (!animationActive || !total || frame > total) return;
    const text = `アニメーション中… ${frame}/${total}`;
    statusText = text;
    panes?.status?.set(text);
    panes?.status?.setProgress?.(`${frame}/${total}`);
    sketch.setMessage(text);
  },
  onRenderComplete: () => {
    animationActive = false;
    setState(AppState.DONE, RunStage.NONE, '完了');
  },
});

function setEmptyVisible(isVisible) {
  if (!emptyState) return;
  emptyState.classList.toggle('is-visible', !!isVisible);
}

function syncEmptyState() {
  setEmptyVisible(!displayBitmap);
}

function getViewportSize() {
  const rect = viewportContainer?.getBoundingClientRect?.();
  const width = Math.floor(rect?.width ?? window.innerWidth ?? 0);
  const height = Math.floor(rect?.height ?? window.innerHeight ?? 0);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function fitToViewport(srcWidth, srcHeight) {
  const { width: maxW, height: maxH } = getViewportSize();
  const scale = Math.min(maxW / srcWidth, maxH / srcHeight);
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  return { width, height };
}

panes = setupPanes({
  onRun: (params) => {
    if (currentState === AppState.RUNNING) return;
    pendingParams = params;
    sketch.setCellsPerFrame(params.cellsPerFrame);
    sketch.setCellSize(params.cellSizePx);
    sketch.setSeed(params.noiseSeed);
    sketch.setParticleConfig({
      cellSize: params.cellSizePx,
      flowFreq: params.flowFreq,
      flowTwist: params.flowTwist,
      flowZSpeed: params.flowZSpeed,
      force: params.force,
      maxSpeed: params.maxSpeed,
      moveFrames: params.moveFrames,
      tileAlpha: params.tileAlpha,
      tileShape: params.tileShape,
      snapToGrid: params.snapToGrid,
      wrapEdges: params.wrapEdges,
    });
    sketch.setMaskVisible(params.showMaskOverlay);
    sketch.setMaskImage(null);
    sketch.setDoneExpected(false);
    startRun(params).catch((error) => {
      console.error(error);
      setState(AppState.ERROR, RunStage.NONE, 'エラー: 画像読み込みに失敗しました');
    });
  },
  onStop: () => {
    stopRun();
  },
  onParamsChange: (params) => {
    pendingParams = params;
    sketch.setCellsPerFrame(params.cellsPerFrame);
    sketch.setCellSize(params.cellSizePx);
    sketch.setSeed(params.noiseSeed);
    sketch.setParticleConfig({
      cellSize: params.cellSizePx,
      flowFreq: params.flowFreq,
      flowTwist: params.flowTwist,
      flowZSpeed: params.flowZSpeed,
      force: params.force,
      maxSpeed: params.maxSpeed,
      moveFrames: params.moveFrames,
      tileAlpha: params.tileAlpha,
      tileShape: params.tileShape,
      snapToGrid: params.snapToGrid,
      wrapEdges: params.wrapEdges,
    });
    sketch.setMaskVisible(params.showMaskOverlay);
  },
  onSampleChange: (sampleName, params) => {
    previewSample(sampleName, params);
  },
});

loadCocoLabels(appBaseUrl)
  .then((labels) => {
    panes.setClassLabels(labels);
  })
  .catch((error) => {
    console.warn(error);
    panes.setClassLabels([]);
  });

function setState(nextState, nextStage, text) {
  currentState = nextState;
  currentStage = nextStage;
  statusText = text;
  panes?.status?.set(text);
  panes?.status?.setDetail?.(nextStage !== RunStage.NONE ? nextStage : '');
  panes?.status?.setProgress?.('');
  sketch.setMessage(text);

  const isRunning = currentState === AppState.RUNNING;
  if (panes) {
    panes.setParamsEnabled(!isRunning);
    panes.setRunEnabled(!isRunning);
    panes.setStopEnabled(isRunning);
  }
}

function resolveSampleUrl(sampleName) {
  return new URL(`samples/${sampleName}`, appBaseUrl).toString();
}

function getBaseName(name) {
  if (!name) return 'mask_drift_yolo';
  const tail = name.split('/').pop() || name;
  return tail.replace(/\.[^/.]+$/, '') || 'mask_drift_yolo';
}


async function loadSampleImage(sampleName) {
  if (!sampleName) return null;
  const response = await fetch(resolveSampleUrl(sampleName));
  if (!response.ok) {
    throw new Error(`Failed to load sample: ${sampleName}`);
  }
  return response.blob();
}

async function loadUploadImage(file) {
  if (!file) return null;
  return file;
}

async function previewSample(sampleName, params) {
  if (!sampleName) return;
  if (currentState === AppState.RUNNING) return;
  if (sampleName === lastPreviewSample && displayBitmap) return;
  lastPreviewSample = sampleName;
  const token = ++previewToken;

  statusText = 'サンプル読み込み中…';
  panes?.status?.set(statusText);
  panes?.status?.setDetail?.(RunStage.LOADING);
  panes?.status?.setProgress?.('');
  sketch.setMessage(statusText);

  try {
    const sourceBlob = await loadSampleImage(sampleName);
    if (token !== previewToken || currentState === AppState.RUNNING) return;
    if (!sourceBlob) {
      throw new Error('Failed to load sample');
    }

    if (displayBitmap) {
      sketch.setBaseImage(null);
      displayBitmap.close?.();
      displayBitmap = null;
    }

    const bitmap = await createImageBitmap(sourceBlob);
    if (token !== previewToken || currentState === AppState.RUNNING) {
      bitmap.close?.();
      return;
    }

    displayBitmap = bitmap;
    sketch.clearQueue();
    sketch.setDoneExpected(false);
    sketch.setMaskImage(null);
    sketch.setMaskVisible(!!params?.showMaskOverlay);
    sketch.setSaveBaseName(getBaseName(sampleName));

    const fit = fitToViewport(displayBitmap.width, displayBitmap.height);
    sketch.setBaseImage(null);
    sketch.resizeCanvas(fit.width, fit.height);
    sketch.setBaseImage(displayBitmap);
    syncEmptyState();

    statusText = '待機中';
    panes?.status?.set(statusText);
    panes?.status?.setDetail?.('');
    panes?.status?.setProgress?.('');
    sketch.setMessage(statusText);
  } catch (error) {
    if (token !== previewToken) return;
    console.error(error);
    statusText = 'エラー: サンプル読み込みに失敗しました';
    panes?.status?.set(statusText);
    panes?.status?.setDetail?.(RunStage.NONE);
    panes?.status?.setProgress?.('');
    sketch.setMessage(statusText);
  }
}

async function startRun(params) {
  runToken += 1;
  const activeToken = runToken;
  animationActive = false;
  sketch.clearQueue();
  sketch.setDoneExpected(false);
  sketch.setMaskImage(null);
  setState(AppState.RUNNING, RunStage.LOADING, '画像読み込み中…');

  if (worker) {
    worker.terminate();
  }

  let sourceBlob = null;
  let saveBaseName = 'mask_drift_yolo';
  if (params.imageSource === 'Upload') {
    if (!params.imageFile) {
      setState(AppState.ERROR, RunStage.NONE, 'エラー: 画像を選択してください');
      return;
    }
    sourceBlob = await loadUploadImage(params.imageFile);
    saveBaseName = getBaseName(params.imageFile?.name);
  } else {
    sourceBlob = await loadSampleImage(params.sampleName);
    saveBaseName = getBaseName(params.sampleName);
  }

  if (activeToken !== runToken) {
    return;
  }

  if (!sourceBlob) {
    setState(AppState.ERROR, RunStage.NONE, 'エラー: 画像の読み込みに失敗しました');
    return;
  }

  if (displayBitmap) {
    sketch.setBaseImage(null);
    displayBitmap.close?.();
    displayBitmap = null;
    syncEmptyState();
  }
  const displayBitmapLocal = await createImageBitmap(sourceBlob);
  const workerBitmap = await createImageBitmap(sourceBlob);
  displayBitmap = displayBitmapLocal;
  sketch.setSaveBaseName(saveBaseName);
  const fit = fitToViewport(displayBitmap.width, displayBitmap.height);
  sketch.setBaseImage(null);
  sketch.resizeCanvas(fit.width, fit.height);
  sketch.setBaseImage(displayBitmap);
  syncEmptyState();

  const enrichedParams = {
    ...params,
    wasmBaseUrl: new URL('wasm/', appBaseUrl).toString(),
    modelPath: new URL('models/yolo11n-seg.onnx', appBaseUrl).toString(),
    renderWidth: fit.width,
    renderHeight: fit.height,
    inputSize: 640,
    moveFrames: Number.isFinite(params.moveFrames) ? Math.max(1, params.moveFrames) : 90,
    maxSpeed: Number.isFinite(params.maxSpeed) ? params.maxSpeed : 1.8,
  };

  try {
    setState(AppState.RUNNING, RunStage.SEGMENTING, '推論中…');
    if (!enrichedParams.selectedClassIndices?.length) {
      setState(AppState.ERROR, RunStage.NONE, 'エラー: クラスを選択してください');
      workerBitmap?.close?.();
      return;
    }
    worker = new Worker(new URL('./worker/pipeline.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const { data } = event;
      if (!data || data.runToken !== runToken) return;

      switch (data.type) {
        case 'error':
          handleWorkerError(data.payload);
          break;
        case 'meta':
          handleMeta(data.payload);
          break;
        case 'status':
          handleStatus(data.payload);
          break;
        case 'mask':
          handleMask(data.payload);
          break;
        case 'cells':
          handleCells(data.payload);
          break;
        case 'done':
          handleDone();
          break;
        default:
          break;
      }
    };
    worker.onerror = (event) => {
      console.error('Worker error:', event);
      setState(AppState.ERROR, RunStage.NONE, 'エラー: Workerで例外が発生しました');
    };
    worker.onmessageerror = (event) => {
      console.error('Worker message error:', event);
      setState(AppState.ERROR, RunStage.NONE, 'エラー: Workerメッセージが破損しています');
    };

    worker.postMessage(
      {
        type: 'start',
        runToken,
        image: workerBitmap,
        params: enrichedParams,
      },
      workerBitmap ? [workerBitmap] : [],
    );
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState(AppState.ERROR, RunStage.NONE, `推論初期化または推論に失敗しました: ${message}`);
    workerBitmap?.close?.();
    return;
  }
}

function stopRun() {
  if (currentState !== AppState.RUNNING) return;
  animationActive = false;
  setState(AppState.RUNNING, RunStage.NONE, '中断中…');
  if (worker) {
    worker.terminate();
    worker = null;
  }
  sketch.clearQueue();
  sketch.setDoneExpected(false);
  setTimeout(() => {
    setState(AppState.STOPPED, RunStage.NONE, '中断');
  }, 0);
}

function handleStatus(payload) {
  if (!payload) return;
  currentStage = payload.stage ?? currentStage;
  panes?.status?.setDetail?.(currentStage !== RunStage.NONE ? currentStage : '');
  if (payload.stage === 'ERROR') {
    setState(AppState.ERROR, RunStage.NONE, payload.text ?? 'エラー');
    return;
  }
  if (payload.text) {
    statusText = payload.text;
    panes.status.set(statusText);
    panes?.status?.setProgress?.('');
    sketch.setMessage(statusText);
  }
}

function handleWorkerError(payload) {
  if (!payload) return;
  if (payload.message) {
    console.error('Worker error detail:', payload.message);
  }
  if (payload.stack) {
    console.error(payload.stack);
  }
}

function handleMask(payload) {
  if (!payload?.width || !payload?.height || !payload?.data) return;
  try {
    const data = new Uint8ClampedArray(payload.data);
    const imageData = new ImageData(data, payload.width, payload.height);
    createImageBitmap(imageData).then((bitmap) => {
      sketch.setMaskImage(bitmap);
    });
  } catch (error) {
    console.warn('Failed to build mask overlay:', error);
  }
}

function handleCells(payload) {
  if (!payload?.cells) return;
  sketch.enqueueCells(payload.cells);
  statusText = '描画中…';
  panes.status.set(statusText);
  panes?.status?.setDetail?.(RunStage.RENDERING);
  sketch.setMessage(statusText);
  currentStage = RunStage.RENDERING;

  if (payload.progress) {
    const { done, total } = payload.progress;
    if (Number.isFinite(done) && Number.isFinite(total) && total > 0) {
      const ratio = Math.min(done / total, 1);
      const percent = Math.round(ratio * 100);
      const text = `描画中… ${percent}%`;
      panes.status.set(text);
      panes?.status?.setProgress?.(`${percent}%`);
      sketch.setMessage(text);
    }
  }
}

function handleMeta(payload) {
  if (!payload) return;
  const { width, height } = payload;
  if (Number.isFinite(width) && Number.isFinite(height)) {
    sketch.resizeCanvas(width, height);
  }
}

function handleDone() {
  const total = Number.isFinite(pendingParams?.moveFrames) ? pendingParams.moveFrames : 90;
  statusText = `アニメーション中… 0/${total}`;
  panes.status.set(statusText);
  panes?.status?.setDetail?.(RunStage.RENDERING);
  panes?.status?.setProgress?.(`0/${total}`);
  sketch.setMessage(statusText);
  currentStage = RunStage.RENDERING;
  animationActive = true;
  sketch.resetAnimationFrame?.();
  sketch.setDoneExpected(true);
}

setState(AppState.IDLE, RunStage.NONE, '待機中');
syncEmptyState();
