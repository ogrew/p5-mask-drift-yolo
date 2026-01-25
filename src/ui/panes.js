import { Pane } from 'tweakpane';
import { DefaultParams } from '../shared/constants.js';
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
  const runButton = runPane.addButton({ title: 'RUN' });
  const stopButton = runPane.addButton({ title: 'STOP' });
  stopButton.disabled = true;

  runButton.on('click', () => {
    onRun?.({ ...params });
  });

  stopButton.on('click', () => {
    onStop?.();
  });

  const inputFolder = paramsPane.addFolder({ title: 'A.入力' });
  const segmentationFolder = paramsPane.addFolder({ title: 'B.セグメンテーション' });
  const asciiFolder = paramsPane.addFolder({ title: 'C.ASCIIレンダリング' });

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

  function setClassLabels(labels, defaults = ['car', 'cat', 'person']) {
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
      classParams[key] = defaults.includes(label);
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

  asciiFolder.addBinding(params, 'cellSizePx', {
    label: 'Grid Size',
    min: 5,
    max: 50,
    step: 1,
  }).on('change', (ev) => {
    params.cellSizePx = ev.value;
    onParamsChange?.({ ...params });
  });

  asciiFolder.addBinding(params, 'textColor', {
    label: 'ASCII Text Color',
    view: 'color',
  }).on('change', (ev) => {
    params.textColor = ev.value;
    onParamsChange?.({ ...params });
  });

  asciiFolder.addBinding(params, 'charSet', {
    label: 'Characters',
  }).on('change', (ev) => {
    params.charSet = ev.value;
    onParamsChange?.({ ...params });
  });

  asciiFolder.addBinding(params, 'cellsPerFrame', {
    label: 'Cells/Frame',
    min: 200,
    max: 10000,
    step: 100,
  }).on('change', (ev) => {
    params.cellsPerFrame = ev.value;
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
