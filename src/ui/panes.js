import { Pane } from 'tweakpane';
import { DefaultParams, ModelInfo } from '../shared/constants.js';
import { SampleImages } from '../shared/samples.js';
import { createStatusController } from './status.js';

export function setupPanes({
  onRun,
  onStop,
  onParamsChange,
} = {}) {
  const runContainer = document.querySelector('#run-panel');
  const paramsContainer = document.querySelector('#params-panel');

  if (!runContainer || !paramsContainer) {
    throw new Error('UI containers are missing.');
  }

  const runPane = new Pane({ container: runContainer, title: 'RUN_UI' });
  const paramsPane = new Pane({ container: paramsContainer, title: 'PARAMS_UI' });

  const params = {
    ...DefaultParams,
    detectedClasses: [],
    imageFile: null,
    selectedClassIndices: [],
  };

  const status = createStatusController(runPane, '待機中');
  const modelState = {
    model: ModelInfo?.label ?? ModelInfo?.path ?? 'yolo11n-seg.onnx',
  };
  runPane.addBinding(modelState, 'model', {
    label: 'MODEL',
    readonly: true,
  });
  const runButton = runPane.addButton({ title: 'RUN' });
  const stopButton = runPane.addButton({ title: 'STOP' });
  stopButton.disabled = true;

  runButton.on('click', () => {
    onRun?.({ ...params });
  });

  stopButton.on('click', () => {
    onStop?.();
  });

  const inputFolder = paramsPane.addFolder({ title: 'A.入力', expanded: false });
  const segmentationFolder = paramsPane.addFolder({ title: 'B.セグメンテーション', expanded: false });
  const renderFolder = paramsPane.addFolder({ title: 'C.レンダリング', expanded: false });

  const imageSourceBinding = inputFolder.addBinding(params, 'imageSource', {
    label: 'Image Source',
    options: {
      Sample: 'Sample',
      Upload: 'Upload',
    },
  });

  const sampleOptions = SampleImages.reduce((acc, item) => {
    acc[item.label] = item.value;
    return acc;
  }, {});

  const sampleBinding = inputFolder.addBinding(params, 'sampleName', {
    label: 'Sample',
    options: sampleOptions,
  });

  imageSourceBinding.on('change', (ev) => {
    params.imageSource = ev.value;
    sampleBinding.disabled = ev.value !== 'Sample';
    onParamsChange?.({ ...params });
  });

  sampleBinding.on('change', (ev) => {
    params.sampleName = ev.value;
    onParamsChange?.({ ...params });
  });

  sampleBinding.disabled = params.imageSource !== 'Sample';

  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/png,image/jpeg';
  uploadInput.style.display = 'none';
  document.body.appendChild(uploadInput);

  inputFolder.addButton({ title: 'Upload Image' }).on('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0] ?? null;
    params.imageFile = file;
    onParamsChange?.({ ...params });
  });

  const classFolder = segmentationFolder.addFolder({ title: 'Detect Classes' });
  classFolder.element?.classList.add('detect-classes');
  const selectRow = classFolder.addFolder({ title: 'Selection' });
  selectRow.element?.classList.add('detect-classes-actions');
  const selectAllButton = selectRow.addButton({ title: 'Select All' });
  const deselectAllButton = selectRow.addButton({ title: 'Deselect All' });
  let classPlaceholderState = { text: 'ラベル未読み込み' };
  let classPlaceholder = classFolder.addBinding(classPlaceholderState, 'text', {
    label: '状態',
    readonly: true,
  });
  let classBindings = [];
  let classParams = {};
  let classMeta = [];

  function updateSelectedClasses() {
    const indices = classMeta
      .filter((meta) => classParams[meta.key])
      .map((meta) => meta.index);
    params.selectedClassIndices = indices;
    onParamsChange?.({ ...params });
  }

  function refreshClassBindings() {
    classBindings.forEach((binding) => binding.refresh());
  }

  selectAllButton.on('click', () => {
    classMeta.forEach((meta) => {
      classParams[meta.key] = true;
    });
    refreshClassBindings();
    updateSelectedClasses();
  });

  deselectAllButton.on('click', () => {
    classMeta.forEach((meta) => {
      classParams[meta.key] = false;
    });
    refreshClassBindings();
    updateSelectedClasses();
  });

  function clearClassBindings() {
    classBindings.forEach((binding) => binding.dispose());
    classBindings = [];
    classMeta = [];
    classParams = {};
    if (classPlaceholder) {
      classPlaceholder.dispose();
      classPlaceholder = null;
    }
    classPlaceholderState = { text: 'ラベル未読み込み' };
  }

  function setClassLabels(labels, defaults = null) {
    const selectAll = !defaults || defaults === 'all';
    clearClassBindings();
    const entries = (labels ?? [])
      .map((label, index) => ({ label, index }))
      .filter((item) => item.label && item.label !== 'background');
    if (entries.length === 0) {
      classPlaceholder = classFolder.addBinding(classPlaceholderState, 'text', {
        label: '状態',
        readonly: true,
      });
      params.selectedClassIndices = [];
      onParamsChange?.({ ...params });
      return;
    }

    entries.forEach(({ label, index }) => {
      const key = `${index}_${label.replace(/[^a-z0-9]+/gi, '_')}`;
      classParams[key] = selectAll ? true : defaults.includes(label);
      classMeta.push({ key, label, index });
      const binding = classFolder.addBinding(classParams, key, { label });
      binding.on('change', updateSelectedClasses);
      classBindings.push(binding);
    });

    updateSelectedClasses();
  }

  segmentationFolder.addBinding(params, 'showMaskOverlay', {
    label: 'Show Mask Overlay',
  }).on('change', (ev) => {
    params.showMaskOverlay = ev.value;
    onParamsChange?.({ ...params });
  });

  segmentationFolder.addBinding(params, 'coverageThreshold', {
    label: 'Coverage Threshold',
    min: 0,
    max: 1,
    step: 0.01,
  }).on('change', (ev) => {
    params.coverageThreshold = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'cellSizePx', {
    label: 'Grid Size',
    min: 1,
    max: 50,
    step: 1,
  }).on('change', (ev) => {
    params.cellSizePx = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'tileShape', {
    label: 'Tile Shape',
    options: {
      Rect: 'rect',
      Circle: 'circle',
    },
  }).on('change', (ev) => {
    params.tileShape = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'tileAlpha', {
    label: 'Tile Alpha',
    min: 0.1,
    max: 1,
    step: 0.05,
  }).on('change', (ev) => {
    params.tileAlpha = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'moveFrames', {
    label: 'Move Frames',
    view: 'text',
  }).on('change', (ev) => {
    const value = Number(ev.value);
    params.moveFrames = Number.isFinite(value) ? value : params.moveFrames;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'flowFreq', {
    label: 'Flow Freq',
    min: 0.01,
    max: 0.2,
    step: 0.01,
  }).on('change', (ev) => {
    params.flowFreq = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'flowTwist', {
    label: 'Flow Twist',
    min: 0.5,
    max: 4,
    step: 0.1,
  }).on('change', (ev) => {
    params.flowTwist = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'flowZSpeed', {
    label: 'Flow Z Speed',
    min: 0.0,
    max: 0.3,
    step: 0.01,
  }).on('change', (ev) => {
    params.flowZSpeed = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'force', {
    label: 'Force',
    min: 0.05,
    max: 1,
    step: 0.05,
  }).on('change', (ev) => {
    params.force = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'maxSpeed', {
    label: 'Max Speed',
    min: 1,
    max: 5,
    step: 0.1,
  }).on('change', (ev) => {
    params.maxSpeed = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'snapToGrid', {
    label: 'Snap To Grid',
  }).on('change', (ev) => {
    params.snapToGrid = ev.value;
    onParamsChange?.({ ...params });
  });

  renderFolder.addBinding(params, 'wrapEdges', {
    label: 'Wrap Edges',
  }).on('change', (ev) => {
    params.wrapEdges = ev.value;
    onParamsChange?.({ ...params });
  });

  function setParamsEnabled(enabled) {
    paramsPane.disabled = !enabled;
  }

  function setRunEnabled(enabled) {
    runButton.disabled = !enabled;
  }

  function setStopEnabled(enabled) {
    stopButton.disabled = !enabled;
  }

  return {
    status,
    params,
    setClassLabels,
    setParamsEnabled,
    setRunEnabled,
    setStopEnabled,
  };
}
