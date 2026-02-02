import { SampleImages } from './samples.js';

export const AppState = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
  DONE: 'DONE',
  ERROR: 'ERROR',
});

export const RunStage = Object.freeze({
  NONE: 'NONE',
  LOADING: 'LOADING',
  SEGMENTING: 'SEGMENTING',
  BUILDING: 'BUILDING',
  RENDERING: 'RENDERING',
});

export const DefaultParams = Object.freeze({
  imageSource: 'Sample',
  sampleName: SampleImages[0]?.value ?? '',
  cellSizePx: 6,
  showMaskOverlay: false,
  cellsPerFrame: 4000,
  cellsChunkSize: 5000,
  maxLongEdge: 2560,
  samplesPerCell: 4,
  coverageThreshold: 0.2,
  flowFreq: 0.08,
  flowTwist: 2.0,
  flowZSpeed: 0.1,
  force: 0.2,
  maxSpeed: 1.8,
  moveFrames: 90,
  tileAlpha: 1.0,
  tileShape: 'rect',
  snapToGrid: true,
  wrapEdges: true,
  noiseSeed: Math.floor(Math.random() * 100000) + 1,
});

export const ModelInfo = Object.freeze({
  label: 'yolo11n-seg.onnx',
  path: 'models/yolo11n-seg.onnx',
});
