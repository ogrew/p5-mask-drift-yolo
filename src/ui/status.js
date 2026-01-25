export function createStatusController(pane, initialText = '待機中') {
  const state = { text: initialText, queue: 0 };
  const binding = pane.addBinding(state, 'text', {
    label: 'STATUS',
    readonly: true,
  });
  const queueBinding = pane.addBinding(state, 'queue', {
    label: 'QUEUE',
    readonly: true,
  });

  return {
    set(text) {
      state.text = text;
      binding.refresh();
    },
    setQueue(value) {
      state.queue = Number.isFinite(value) ? value : 0;
      queueBinding.refresh();
    },
  };
}
