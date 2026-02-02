function setStatusClass(target, text) {
  if (!target) return;
  target.classList.remove('is-success', 'is-error');
  if (!text) return;
  if (/エラー|error/i.test(text)) {
    target.classList.add('is-error');
  } else if (/完了|done|success/i.test(text)) {
    target.classList.add('is-success');
  }
}

function setText(target, text) {
  if (!target) return;
  target.textContent = text ?? '';
}

export function createStatusController(
  { statusEl, detailEl, progressEl, modelEl } = {},
  initialText = '待機中',
  initialModel = '',
) {
  setText(statusEl, initialText);
  setText(detailEl, '');
  setText(progressEl, '');
  setText(modelEl, initialModel);
  setStatusClass(statusEl, initialText);

  return {
    set(text) {
      setText(statusEl, text);
      setStatusClass(statusEl, text);
    },
    setDetail(text) {
      setText(detailEl, text);
    },
    setProgress(text) {
      setText(progressEl, text);
    },
    setModel(text) {
      setText(modelEl, text);
    },
  };
}
