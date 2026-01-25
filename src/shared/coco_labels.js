export async function loadCocoLabels(baseUrl) {
  const url = new URL('models/coco_labels.json', baseUrl).toString();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load coco_labels.json (${response.status})`);
  }
  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.labels)) return data.labels;
  if (data && typeof data === 'object') {
    return Object.keys(data)
      .map((key) => Number(key))
      .filter((key) => Number.isFinite(key))
      .sort((a, b) => a - b)
      .map((key) => data[key]);
  }
  return [];
}
