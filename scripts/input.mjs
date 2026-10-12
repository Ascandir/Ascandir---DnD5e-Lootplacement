import { MODULE_ID, L, setting, PHYSICAL_TYPES, isGroundToken, getActingToken } from "./config.mjs";
import { placeDroppedItem, pickUp, previewGroundItem } from "./ground.mjs";

/* ============================================ */
/*  Drag & drop onto the canvas                 */
/* ============================================ */

function modifierHeld(event) {
  const key = setting("dropKey");
  if ( key === "none" ) return true;
  if ( !event ) return false;
  if ( key === "alt" ) return !!event.altKey;
  if ( key === "shift" ) return !!event.shiftKey;
  if ( key === "ctrl" ) return !!(event.ctrlKey || event.metaKey);
  return true;
}

/** Item type straight from the drag data, if it's already known (avoids loading the document twice). */
function quickType(data) {
  return data?.data?.type ?? null;
}

function onDropCanvasData(_canvas, data, event) {
  try {
    if ( (data?.type !== "Item") || !setting("enableDrop") || !canvas?.ready ) return;
    if ( !modifierHeld(event) ) return;
    const t = quickType(data);
    if ( t && !PHYSICAL_TYPES.includes(t) ) return;

    let point = (Number.isFinite(data.x) && Number.isFinite(data.y)) ? { x: data.x, y: data.y } : null;
    if ( !point && event ) {
      try { point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY }); } catch {}
    }
    if ( !point ) return;

    // We take over from here – load the item and place it
    (async () => {
      const item = await CONFIG.Item.documentClass.fromDropData(data).catch(() => null);
      if ( !item ) return ui.notifications.warn(L("Warn.ItemGone"));
      if ( !PHYSICAL_TYPES.includes(item.type) ) return ui.notifications.warn(L("Warn.NotPhysical"));
      await placeDroppedItem(item, point);
    })().catch(err => console.error(`${MODULE_ID} |`, err));
    return false;
  } catch(err) {
    console.error(`${MODULE_ID} |`, err);
  }
}

/** Register our drop handler and move it in front of other modules (e.g. Item Piles), so it wins. */
export function registerDrop() {
  const id = Hooks.on("dropCanvasData", onDropCanvasData);
  try {
    const list = Hooks.events?.dropCanvasData;
    if ( Array.isArray(list) ) {
      const i = list.findIndex(h => h.id === id);
      if ( i > 0 ) list.unshift(...list.splice(i, 1));
    }
  } catch(err) {
    console.warn(`${MODULE_ID} | could not reorder drop hook`, err);
  }
}

/* ============================================ */
/*  Double-click on ground items                */
/* ============================================ */

function groundTokenAt(point) {
  const hits = canvas.tokens.placeables.filter(t => isGroundToken(t) && t.visible
    && (game.user.isGM || !t.document.hidden)
    && (Math.hypot(point.x - t.center.x, point.y - t.center.y) <= Math.max(t.w, t.h, canvas.dimensions.size * 0.35) / 2));
  return hits.at(-1) ?? null;
}

let lastDown = { t: 0, x: 0, y: 0, id: null };
let swallowUp = false;
let swallowDbl = 0;

function canvasElement() {
  return canvas?.app?.canvas ?? canvas?.app?.view ?? null;
}

function isCanvasTarget(event) {
  const el = canvasElement();
  return !!el && ((event.target === el) || (event.target?.id === "board"));
}

function onPointerDown(event) {
  if ( (event.button !== 0) || !canvas?.ready || !isCanvasTarget(event) ) return;
  let point;
  try { point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY }); }
  catch { point = canvas.stage.worldTransform.applyInverse({ x: event.clientX, y: event.clientY }); }
  const token = groundTokenAt(point);
  if ( !token ) { lastDown = { t: 0, x: 0, y: 0, id: null }; return; }

  const now = performance.now();
  const isDouble = (lastDown.id === token.id) && ((now - lastDown.t) < 400)
    && (Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) < 14);
  lastDown = isDouble ? { t: 0, x: 0, y: 0, id: null } : { t: now, x: event.clientX, y: event.clientY, id: token.id };

  // The GM without a selected character may still select / drag ground items with single clicks
  const gmFree = game.user.isGM && !getActingToken();
  if ( gmFree && !isDouble ) return;

  // Keep Foundry from selecting / targeting / opening sheets for these clicks
  event.stopImmediatePropagation();
  event.preventDefault();
  swallowUp = true;
  swallowDbl = performance.now();
  if ( !isDouble ) return;

  if ( gmFree ) previewGroundItem(token);
  else pickUp(token);
}

function onPointerUp(event) {
  if ( !swallowUp || (event.button !== 0) ) return;
  swallowUp = false;
  if ( isCanvasTarget(event) ) event.stopImmediatePropagation();
}

/** Some modules listen for DOM double-clicks; swallow those too while we handle the click. */
function onDblClick(event) {
  if ( ((performance.now() - swallowDbl) < 600) && isCanvasTarget(event) ) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

/* ============================================ */
/*  Rotate selected ground items with the wheel  */
/* ============================================ */

const pendingRotation = new Map();
let rotationTimer = null;

/** Save the new rotations shortly after the wheel stops (one update instead of dozens). */
function flushRotation() {
  rotationTimer = null;
  const updates = [...pendingRotation.entries()].map(([_id, rotation]) => ({ _id, rotation, lockRotation: false }));
  pendingRotation.clear();
  if ( updates.length && canvas.scene ) {
    canvas.scene.updateEmbeddedDocuments("Token", updates).catch(err => console.error(`${MODULE_ID} |`, err));
  }
}

function onWheel(event) {
  if ( !setting("wheelRotate") || !canvas?.ready || !isCanvasTarget(event) ) return;
  if ( event.ctrlKey || event.metaKey || event.altKey ) return; // leave browser zoom & other modifiers alone
  const tokens = canvas.tokens.controlled.filter(t => isGroundToken(t) && t.document.isOwner);
  if ( !tokens.length ) return;
  const delta = event.deltaY || event.deltaX; // Shift+wheel turns into a horizontal scroll in some browsers
  if ( !delta ) return;

  // Rotate instead of zooming
  event.preventDefault();
  event.stopImmediatePropagation();

  const step = event.shiftKey ? setting("wheelStepFine") : setting("wheelStep");
  const dir = Math.sign(delta);
  for ( const t of tokens ) {
    const current = pendingRotation.get(t.id) ?? t.document.rotation ?? 0;
    const next = (((current + (dir * step)) % 360) + 360) % 360;
    pendingRotation.set(t.id, next);
    // Show it immediately, the server update follows when the wheel stops
    try { if ( t.mesh ) t.mesh.angle = next; } catch {}
  }
  clearTimeout(rotationTimer);
  rotationTimer = setTimeout(flushRotation, 250);
}

export function registerInput() {
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("dblclick", onDblClick, { capture: true });
}
