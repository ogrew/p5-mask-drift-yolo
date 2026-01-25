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
  charSet: ' .:-=+*#%@',
  cellSizePx: 16,
  textColor: '#ffffff',
  showMaskOverlay: false,
  cellsPerFrame: 2000,
  cellsChunkSize: 5000,
  maxLongEdge: 2560,
  samplesPerCell: 4,
  coverageThreshold: 0.2,
});
