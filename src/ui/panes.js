import { Pane } from 'tweakpane';
import { DefaultParams, ModelInfo } from '../shared/constants.js';
import { SampleImages } from '../shared/samples.js';
import { createStatusController } from './status.js';

function buildSampleOptions() {
  return SampleImages.reduce((acc, item) => {
    acc[item.label] = item.value;
    return acc;
  }, {});
}

export function setupPanes({
  onRun,
  onStop,
  onParamsChange,
  onSampleChange,
} = {}) {
  const uiPanel = document.querySelector('#ui');
  const paneContainer = document.querySelector('#pane');
  const sampleSelect = document.querySelector('#sampleSelect');
  const refreshSamples = document.querySelector('#refreshSamples');
  const dropZone = document.querySelector('#dropZone');
  const dropZoneText = dropZone?.querySelector('.drop-zone-text');
  const fileInput = document.querySelector('#fileInput');
  const runButton = document.querySelector('#playButton');
  const stopButton = document.querySelector('#stopButton');
  const togglePanelButton = document.querySelector('#togglePanel');

  const modelLabel = ModelInfo?.label ?? ModelInfo?.path ?? 'yolo11n-seg.onnx';
  const status = createStatusController(
    {
      statusEl: document.querySelector('#statusValue'),
      detailEl: document.querySelector('#detailValue'),
      progressEl: document.querySelector('#progressValue'),
      modelEl: document.querySelector('#modelValue'),
    },
    '待機中',
    modelLabel,
  );

  if (
    !uiPanel ||
    !paneContainer ||
    !sampleSelect ||
    !refreshSamples ||
    !dropZone ||
    !fileInput ||
    !runButton ||
    !stopButton ||
    !togglePanelButton
  ) {
    throw new Error('UI containers are missing.');
  }

  const params = {
    ...DefaultParams,
    detectedClasses: [],
    imageFile: null,
    selectedClassIndices: [],
  };

  const paramsPane = new Pane({ container: paneContainer, title: 'PARAMS' });

  function setPanelCollapsed(collapsed) {
    uiPanel.classList.toggle('is-collapsed', collapsed);
    togglePanelButton.textContent = collapsed ? 'Show Panel' : 'Hide Panel';
  }

  togglePanelButton.addEventListener('click', () => {
    setPanelCollapsed(!uiPanel.classList.contains('is-collapsed'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'p' && event.key !== 'P') return;
    setPanelCollapsed(!uiPanel.classList.contains('is-collapsed'));
  });

  setPanelCollapsed(uiPanel.classList.contains('is-collapsed'));

  function populateSamples(keepSelection = true) {
    const current = keepSelection ? sampleSelect.value : null;
    sampleSelect.innerHTML = '';
    const sampleOptions = buildSampleOptions();
    const sampleValues = new Set(SampleImages.map((item) => item.value));
    Object.entries(sampleOptions).forEach(([label, value]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sampleSelect.appendChild(option);
    });
    const nextValue =
      current && sampleValues.has(current)
        ? current
        : params.sampleName;
    if (nextValue) {
      sampleSelect.value = nextValue;
      params.sampleName = nextValue;
    }
  }

  function syncSampleSelection() {
    const value = sampleSelect.value;
    params.sampleName = value;
    params.imageSource = 'Sample';
    params.imageFile = null;
    updateDropZoneLabel();
    paramsPane.refresh();
    onParamsChange?.({ ...params });
    onSampleChange?.(value, { ...params });
  }

  function updateDropZoneLabel() {
    if (!dropZoneText) return;
    if (params.imageFile) {
      dropZoneText.textContent = params.imageFile.name;
    } else {
      dropZoneText.textContent = 'Drop file or click to browse';
    }
  }

  function setUploadFile(file) {
    params.imageFile = file ?? null;
    if (params.imageFile) {
      params.imageSource = 'Upload';
    }
    updateDropZoneLabel();
    paramsPane.refresh();
    onParamsChange?.({ ...params });
  }

  populateSamples(false);
  updateDropZoneLabel();

  sampleSelect.addEventListener('change', () => {
    syncSampleSelection();
  });

  refreshSamples.addEventListener('click', () => {
    populateSamples(true);
  });

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0] ?? null;
    setUploadFile(file);
  });

  dropZone.addEventListener('dragover', (event) => {
    if (fileInput.disabled) return;
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('is-dragover');
  });

  dropZone.addEventListener('drop', (event) => {
    if (fileInput.disabled) return;
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      setUploadFile(file);
    }
  });

  dropZone.addEventListener('click', () => {
    if (fileInput.disabled) return;
    fileInput.click();
  });

  dropZone.addEventListener('keydown', (event) => {
    if (fileInput.disabled) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    fileInput.click();
  });

  runButton.addEventListener('click', () => {
    onRun?.({ ...params });
  });

  stopButton.addEventListener('click', () => {
    onStop?.();
  });

  stopButton.disabled = true;

  const segmentationFolder = paramsPane.addFolder({ title: 'Segmentation', expanded: false });
  const renderFolder = paramsPane.addFolder({ title: 'Rendering', expanded: false });

  let classPlaceholderState = { text: 'ラベル未読み込み' };
  let classPlaceholder = null;
  let classBindings = [];
  let classParams = {};
  let classMeta = [];

  const classFolder = segmentationFolder.addFolder({ title: 'Detect Classes' });
  classFolder.element?.classList.add('detect-classes');
  const selectRow = classFolder.addFolder({ title: 'Selection' });
  selectRow.element?.classList.add('detect-classes-actions');
  const selectAllButton = selectRow.addButton({ title: 'Select All' });
  const deselectAllButton = selectRow.addButton({ title: 'Deselect All' });

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

  const tilesFolder = renderFolder.addFolder({ title: 'Tiles', expanded: true });
  const motionFolder = renderFolder.addFolder({ title: 'Motion', expanded: false });
  const flowFolder = renderFolder.addFolder({ title: 'Flow Field', expanded: false });
  const behaviorFolder = renderFolder.addFolder({ title: 'Behavior', expanded: false });
  const randomnessFolder = renderFolder.addFolder({ title: 'Randomness', expanded: false });

  tilesFolder.addBinding(params, 'cellSizePx', {
    label: 'Cell Size (px)',
    min: 1,
    max: 24,
    step: 1,
  }).on('change', (ev) => {
    params.cellSizePx = ev.value;
    onParamsChange?.({ ...params });
  });

  tilesFolder.addBinding(params, 'tileShape', {
    label: 'Tile Shape',
    options: {
      Rect: 'rect',
      Circle: 'circle',
    },
  }).on('change', (ev) => {
    params.tileShape = ev.value;
    onParamsChange?.({ ...params });
  });

  tilesFolder.addBinding(params, 'tileAlpha', {
    label: 'Tile Alpha',
    min: 0.0,
    max: 1,
    step: 0.05,
  }).on('change', (ev) => {
    params.tileAlpha = ev.value;
    onParamsChange?.({ ...params });
  });

  motionFolder.addBinding(params, 'moveFrames', {
    label: 'Move Frames',
    view: 'text',
  }).on('change', (ev) => {
    const value = Number(ev.value);
    params.moveFrames = Number.isFinite(value) ? value : params.moveFrames;
    onParamsChange?.({ ...params });
  });

  motionFolder.addBinding(params, 'maxSpeed', {
    label: 'Max Speed',
    min: 0.0,
    max: 5.0,
    step: 0.1,
  }).on('change', (ev) => {
    params.maxSpeed = ev.value;
    onParamsChange?.({ ...params });
  });

  flowFolder.addBinding(params, 'flowFreq', {
    label: 'Flow Freq',
    min: 0.01,
    max: 0.3,
    step: 0.01,
  }).on('change', (ev) => {
    params.flowFreq = ev.value;
    onParamsChange?.({ ...params });
  });

  flowFolder.addBinding(params, 'flowTwist', {
    label: 'Flow Twist',
    min: 0.5,
    max: 4,
    step: 0.1,
  }).on('change', (ev) => {
    params.flowTwist = ev.value;
    onParamsChange?.({ ...params });
  });

  flowFolder.addBinding(params, 'flowZSpeed', {
    label: 'Flow Z Speed',
    min: 0.0,
    max: 0.3,
    step: 0.01,
  }).on('change', (ev) => {
    params.flowZSpeed = ev.value;
    onParamsChange?.({ ...params });
  });

  behaviorFolder.addBinding(params, 'force', {
    label: 'Force',
    min: 0.05,
    max: 1,
    step: 0.05,
  }).on('change', (ev) => {
    params.force = ev.value;
    onParamsChange?.({ ...params });
  });

  behaviorFolder.addBinding(params, 'snapToGrid', {
    label: 'Snap To Grid',
  }).on('change', (ev) => {
    params.snapToGrid = ev.value;
    onParamsChange?.({ ...params });
  });

  behaviorFolder.addBinding(params, 'wrapEdges', {
    label: 'Wrap Edges',
  }).on('change', (ev) => {
    params.wrapEdges = ev.value;
    onParamsChange?.({ ...params });
  });

  randomnessFolder.addBinding(params, 'noiseSeed', {
    label: 'Noise Seed',
    step: 1,
  }).on('change', (ev) => {
    const value = Number(ev.value);
    if (Number.isFinite(value)) {
      params.noiseSeed = value;
      onParamsChange?.({ ...params });
    }
  });

  function setParamsEnabled(enabled) {
    paramsPane.disabled = !enabled;
    sampleSelect.disabled = !enabled;
    refreshSamples.disabled = !enabled;
    dropZone.classList.toggle('is-disabled', !enabled);
    fileInput.disabled = !enabled;
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
