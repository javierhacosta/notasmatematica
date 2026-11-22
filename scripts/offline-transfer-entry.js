import JSZip from "jszip";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const DB_NAME = "docente_offline_completo_v2";
const STORES = ["tables", "files", "queue", "meta"];
const PK = {
  actividades:"id", anotaciones:"id", anotaciones_actividades:"actividad_id",
  asistencia:"id", asistencia_horarios:["curso","fecha"], asistencia_tipos_dia:"id",
  calificaciones:"id", visitas_estudiantes:"id", fotos_actividades:"id",
  fotos_asistencia:"id", matematica:"id", listageneral:"id",
  azar_estudiantes_elegidos:"id", azar_estudiantes_descartados:"id",
  distribuciones_aula:"curso"
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No se pudo abrir la base de datos offline."));
  });
}
function readStore(db, name) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readonly");
    const req = tx.objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function writeStore(db, name, rows, clearFirst) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    const store = tx.objectStore(name);
    if (clearFirst) store.clear();
    for (const row of rows) {
      const value = { ...row };
      if (name === "queue") delete value.qid;
      store.put(value);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("No se pudo guardar " + name));
    tx.onabort = () => reject(tx.error || new Error("Se canceló el guardado de " + name));
  });
}
function progress(title, pct, detail) {
  let box = document.getElementById("transferProgress");
  if (!box) {
    box = document.createElement("div");
    box.id = "transferProgress";
    box.style.cssText = "position:fixed;inset:0;z-index:300000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:18px";
    box.innerHTML = '<div style="background:white;color:#222;padding:20px;border-radius:14px;width:min(440px,100%);font-family:Arial"><b id="transferTitle"></b><div style="height:12px;background:#e5e7eb;border-radius:20px;overflow:hidden;margin:14px 0 8px"><div id="transferBar" style="height:100%;width:0;background:#16803c"></div></div><strong id="transferPct">0%</strong><div id="transferDetail" style="font-size:12px;color:#555;margin-top:7px;overflow-wrap:anywhere"></div></div>';
    document.body.appendChild(box);
  }
  document.getElementById("transferTitle").textContent = title;
  document.getElementById("transferBar").style.width = pct + "%";
  document.getElementById("transferPct").textContent = pct + "%";
  document.getElementById("transferDetail").textContent = detail || "";
}
function closeProgress() {
  document.getElementById("transferProgress")?.remove();
}
function jsonKey(row, table) {
  const pk = PK[table];
  if (Array.isArray(pk)) return pk.map(k => String(row?.[k] ?? "")).join("|");
  if (pk) return String(row?.[pk] ?? "");
  return JSON.stringify(row);
}
function mergeTableRows(table, oldRows, newRows) {
  const map = new Map();
  for (const row of oldRows || []) map.set(jsonKey(row, table), row);
  for (const row of newRows || []) map.set(jsonKey(row, table), row);
  return Array.from(map.values());
}
function blobToBase64(blob) {
  return blob.arrayBuffer().then(buffer => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  });
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function shareBackup(blob, filename) {
  try {
    const base64 = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true
    });
    await Share.share({
      title: "Respaldo del Panel Docente",
      text: "Copia de seguridad para transferir los datos a otro celular.",
      url: saved.uri,
      dialogTitle: "Compartir respaldo ZIP"
    });
    return true;
  } catch (error) {
    console.warn("No se pudo abrir el menú nativo para compartir; se usará la descarga.", error);
    downloadBlob(blob, filename);
    return false;
  }
}
async function exportBackup() {
  const db = await openDB();
  progress("Preparando respaldo completo", 2, "Leyendo tablas, fotografías, archivos y cambios pendientes...");
  const [tables, files, queue, meta] = await Promise.all(STORES.map(name => readStore(db, name)));
  const zip = new JSZip();
  const tableInfo = [];
  for (let i = 0; i < tables.length; i++) {
    const item = tables[i];
    zip.file("tablas/" + item.name + ".json", JSON.stringify(item));
    tableInfo.push({ name: item.name, rows: (item.rows || []).length });
    progress("Preparando respaldo completo", Math.round(5 + (i + 1) / Math.max(1, tables.length) * 20), "Tabla " + (i + 1) + " de " + tables.length + ": " + item.name);
  }
  const fileInfo = [];
  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const zipPath = "archivos/" + String(i + 1).padStart(7, "0") + ".bin";
    zip.file(zipPath, item.blob);
    fileInfo.push({ path: item.path, type: item.type, name: item.name, updated: item.updated, zipPath: zipPath });
    progress("Incluyendo fotografías y archivos", Math.round(25 + (i + 1) / Math.max(1, files.length) * 35), (i + 1) + " de " + files.length + " archivos");
  }
  const queueInfo = [];
  for (let i = 0; i < queue.length; i++) {
    const item = { ...queue[i] };
    if (item.blob instanceof Blob) {
      const zipPath = "pendientes/" + String(i + 1).padStart(7, "0") + ".bin";
      zip.file(zipPath, item.blob);
      item.__blobZip = zipPath;
      delete item.blob;
    }
    delete item.qid;
    queueInfo.push(item);
  }
  zip.file("pendientes.json", JSON.stringify(queueInfo));
  zip.file("meta.json", JSON.stringify(meta));
  const manifest = {
    app: "Panel Docente",
    format: "docente-offline-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    totals: {
      tables: tables.length,
      rows: tableInfo.reduce((n, x) => n + x.rows, 0),
      files: files.length,
      pendingChanges: queue.length
    },
    tableInfo: tableInfo,
    fileInfo: fileInfo
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  progress("Comprimiendo respaldo ZIP", 65, "El ZIP puede tardar según la cantidad y tamaño de las fotografías.");
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } },
    metadata => progress("Comprimiendo respaldo ZIP", Math.min(99, 65 + Math.round(metadata.percent * 0.34)), "Comprimiendo: " + Math.round(metadata.percent) + "%")
  );
  const date = new Date().toISOString().slice(0, 10);
  const filename = "respaldo_panel_docente_" + date + ".zip";
  progress("Respaldo preparado", 100, "Tablas: " + manifest.totals.rows + " registros · Archivos: " + files.length + " · Pendientes: " + queue.length);
  await new Promise(resolve => setTimeout(resolve, 350));
  closeProgress();
  await shareBackup(blob, filename);
  alert("Respaldo ZIP generado. Incluye los datos offline, archivos y cambios pendientes. Guarda o comparte el archivo en un lugar seguro.");
}
async function readZipJson(zip, name, fallback) {
  const entry = zip.file(name);
  if (!entry) return fallback;
  return JSON.parse(await entry.async("string"));
}
async function importBackup(file) {
  progress("Revisando respaldo ZIP", 2, file.name + " · " + (file.size / 1024 / 1024).toFixed(1) + " MB");
  const zip = await JSZip.loadAsync(file);
  const manifest = await readZipJson(zip, "manifest.json", null);
  if (!manifest || manifest.format !== "docente-offline-backup" || manifest.version !== 1) {
    throw new Error("El ZIP no es un respaldo compatible del Panel Docente.");
  }
  const combine = confirm("¿Deseas COMBINAR los datos del ZIP con los que ya existen en este celular?\n\nAceptar: combinar y actualizar registros coincidentes.\nCancelar: reemplazar completamente la copia offline actual.");
  if (!combine && !confirm("Se reemplazarán las tablas, archivos y cambios pendientes que existen en este celular. ¿Continuar?")) return;
  const db = await openDB();
  const incomingTables = [];
  const tableNames = Object.keys(zip.files).filter(name => name.startsWith("tablas/") && name.endsWith(".json"));
  for (let i = 0; i < tableNames.length; i++) {
    const row = await readZipJson(zip, tableNames[i], null);
    if (row && row.name && Array.isArray(row.rows)) incomingTables.push(row);
    progress("Leyendo tablas del respaldo", Math.round(5 + (i + 1) / Math.max(1, tableNames.length) * 20), (i + 1) + " de " + tableNames.length + " tablas");
  }
  const incomingFiles = [];
  for (let i = 0; i < (manifest.fileInfo || []).length; i++) {
    const info = manifest.fileInfo[i];
    const entry = zip.file(info.zipPath);
    if (!entry) throw new Error("Falta un archivo dentro del ZIP: " + info.path);
    const blob = await entry.async("blob");
    incomingFiles.push({ path: info.path, blob: blob, type: info.type || blob.type, name: info.name, updated: info.updated || Date.now() });
    progress("Recuperando fotografías y archivos", Math.round(25 + (i + 1) / Math.max(1, manifest.fileInfo.length) * 35), (i + 1) + " de " + manifest.fileInfo.length + " archivos");
  }
  const incomingQueue = await readZipJson(zip, "pendientes.json", []);
  for (const item of incomingQueue) {
    if (item.__blobZip) {
      const entry = zip.file(item.__blobZip);
      if (!entry) throw new Error("Falta un archivo adjunto de la cola de sincronización.");
      item.blob = await entry.async("blob");
      delete item.__blobZip;
    }
  }
  const incomingMeta = await readZipJson(zip, "meta.json", []);
  const currentTables = combine ? await readStore(db, "tables") : [];
  const tableMap = new Map(currentTables.map(item => [item.name, item]));
  for (const item of incomingTables) {
    const old = tableMap.get(item.name);
    tableMap.set(item.name, {
      name: item.name,
      rows: combine ? mergeTableRows(item.name, old?.rows || [], item.rows) : item.rows,
      updated: Date.now()
    });
  }
  const currentFiles = combine ? await readStore(db, "files") : [];
  const fileMap = new Map(currentFiles.map(item => [item.path, item]));
  for (const item of incomingFiles) fileMap.set(item.path, item);
  const currentQueue = combine ? await readStore(db, "queue") : [];
  const queueSignatures = new Set(currentQueue.map(item => JSON.stringify(Object.fromEntries(Object.entries(item).filter(([k]) => k !== "qid")))));
  const finalQueue = currentQueue.slice();
  for (const item of incomingQueue) {
    const signature = JSON.stringify(item);
    if (!queueSignatures.has(signature)) {
      finalQueue.push(item);
      queueSignatures.add(signature);
    }
  }
  const currentMeta = combine ? await readStore(db, "meta") : [];
  const metaMap = new Map(currentMeta.map(item => [item.key, item]));
  for (const item of incomingMeta) metaMap.set(item.key, item);
  metaMap.set("copiaCompleta", { key: "copiaCompleta", value: true, updated: Date.now() });
  metaMap.set("copiaFecha", { key: "copiaFecha", value: Date.now() });
  progress("Guardando respaldo en este celular", 70, "Guardando tablas, archivos y cola de sincronización...");
  await writeStore(db, "tables", Array.from(tableMap.values()), true);
  await writeStore(db, "files", Array.from(fileMap.values()), true);
  await writeStore(db, "queue", finalQueue, true);
  await writeStore(db, "meta", Array.from(metaMap.values()), true);
  try { await navigator.storage?.persist?.(); } catch (_) {}
  localStorage.setItem("modoConexionDocente_v1", "offline");
  progress("Importación terminada", 100, "Tablas: " + manifest.totals.rows + " registros · Archivos recuperados: " + incomingFiles.length + " · Pendientes: " + finalQueue.length);
  await new Promise(resolve => setTimeout(resolve, 600));
  closeProgress();
  alert("Respaldo importado correctamente. La aplicación se reiniciará en modo offline para utilizar los datos recuperados.");
  location.reload();
}
function installControls() {
  const panel = document.getElementById("controlModoConexion");
  if (!panel || document.getElementById("controlesTransferenciaOffline")) return;
  const wrap = document.createElement("div");
  wrap.id = "controlesTransferenciaOffline";
  wrap.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
  wrap.innerHTML = '<button type="button" id="exportarRespaldoOffline" style="flex:1;min-width:135px;border:0;border-radius:7px;padding:10px;background:#2e7d32;color:white;font-weight:700">⬆ Exportar ZIP</button><button type="button" id="importarRespaldoOffline" style="flex:1;min-width:135px;border:0;border-radius:7px;padding:10px;background:#455a64;color:white;font-weight:700">⬇ Importar ZIP</button><input id="archivoRespaldoOffline" type="file" accept=".zip,application/zip" style="display:none">';
  panel.appendChild(wrap);
  const input = wrap.querySelector("#archivoRespaldoOffline");
  wrap.querySelector("#exportarRespaldoOffline").addEventListener("click", async () => {
    try { await exportBackup(); } catch (error) { closeProgress(); console.error(error); alert("No se pudo exportar el respaldo: " + (error.message || error)); }
  });
  wrap.querySelector("#importarRespaldoOffline").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try { await importBackup(file); } catch (error) { closeProgress(); console.error(error); alert("No se pudo importar el respaldo: " + (error.message || error)); }
    finally { input.value = ""; }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installControls, { once: true });
else installControls();
