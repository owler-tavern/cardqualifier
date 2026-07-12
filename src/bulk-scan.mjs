import { scoreCard, extractCardJsonFromPng } from "./scorer.mjs";

export function buildRecord({ fileName, text, sourcePng }, score = scoreCard) {
  const result = score(text);
  return {
    fileName,
    name: (result.name || "").trim() || fileName,
    text,
    sourcePng,
    result,
    applied: [],
    ledger: [`${result.total} · loaded`],
    previous: null,
    gateOpen: false,
    edited: false,
  };
}

export function errorRecord(fileName, error) {
  return {
    fileName,
    name: fileName,
    text: null,
    sourcePng: null,
    result: null,
    error: String(error?.message ?? error),
    applied: [],
    ledger: [],
    previous: null,
    gateOpen: false,
    edited: false,
  };
}

export async function readCardFile(file) {
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  if (isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { text: extractCardJsonFromPng(bytes), sourcePng: { bytes, name: file.name } };
  }
  return { text: await file.text(), sourcePng: null };
}

export async function scanFiles(files, { onProgress, chunkSize = 20, read = readCardFile, score = scoreCard } = {}) {
  const list = [...files].filter((f) => /\.(json|png)$/i.test(f.name));
  const records = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    try {
      const { text, sourcePng } = await read(file);
      records.push(buildRecord({ fileName: file.name, text, sourcePng }, score));
    } catch (e) {
      records.push(errorRecord(file.name, e));
    }
    if ((i + 1) % chunkSize === 0 || i === list.length - 1) {
      onProgress?.(i + 1, list.length);
      await new Promise((r) => setTimeout(r, 0)); // yield so the UI stays responsive
    }
  }
  return records;
}