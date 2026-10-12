import { MODULE_ID, L, setting, PHYSICAL_TYPES, displayName, groundItemData, randomBetween } from "./config.mjs";
import { gmHandlers } from "./net.mjs";
import { rememberedLook, MIN_SIZE, MAX_SIZE } from "./appearance.mjs";

/* ============================================ */
/*  Placement mode                              */
/*  Right-click an item → "Auf den Boden legen" */
/*  → the picture follows the mouse →           */
/*  left-click places it, right-click / Esc ends */
/* ============================================ */

/** Current placement, or null. */
let state = null;

export function isPlacing() {
  return !!state;
}

function canvasElement() {
  return canvas?.app?.canvas ?? canvas?.app?.view ?? null;
}

function isCanvasTarget(event) {
  const el = canvasElement();
  return !!el && ((event.target === el) || (event.target?.id === "board"));
}

function toCanvas(event) {
  try { return canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY }); }
  catch { return canvas.stage.worldTransform.applyInverse({ x: event.clientX, y: event.clientY }); }
}

function startRotation() {
  return setting("randomRotation") ? randomBetween(-35, 35) : 0;
}

/** Update the preview picture (position, size, rotation). */
function drawPreview() {
  const s = state?.sprite;
  if ( !s || s.destroyed ) return;
  const gs = canvas.dimensions.size;
  const tex = s.texture;
  const px = state.size * gs;
  s.scale.set(px / Math.max(tex.width, tex.height, 1));
  s.angle = state.rotation;
  if ( state.point ) s.position.set(state.point.x, state.point.y);
  s.visible = !!state.point;
}

/**
 * Start placing an item.
 * @param {Item} item   An item from the sidebar, a compendium or an actor's inventory.
 */
export async function startPlacement(item) {
  if ( !game.user.isGM ) return;
  if ( !canvas?.ready || !canvas.scene ) return ui.notifications.warn(L("Warn.NoScene"));
  if ( !item || !PHYSICAL_TYPES.includes(item.type) ) return ui.notifications.warn(L("Warn.NotPhysical"));
  endPlacement();

  const fromActor = item.parent instanceof Actor;
  if ( fromActor && (item.type === "container") && item.parent.items.some(i => i.system.container === item.id) ) {
    return ui.notifications.warn(L("Warn.ContainerNotEmpty"));
  }

  const data = groundItemData(item);
  const look = rememberedLook(data);
  const src = look?.src || item.img;

  let tex = null;
  try { tex = await (foundry.canvas?.loadTexture ?? globalThis.loadTexture)(src); } catch {}
  const sprite = tex ? new PIXI.Sprite(tex) : new PIXI.Sprite(PIXI.Texture.WHITE);
  sprite.anchor.set(0.5);
  sprite.alpha = 0.75;
  sprite.eventMode = "none";
  sprite.visible = false;
  (canvas.controls ?? canvas.stage).addChild(sprite);

  state = {
    item, fromActor, sprite,
    size: look?.size ?? setting("groundSize"),
    rotation: startRotation(),
    rotationTouched: false,
    point: null,
    busy: false
  };
  drawPreview();
  ui.notifications.info(L("Place.Hint", { name: displayName(data) }));
}

export function endPlacement() {
  if ( !state ) return;
  try { state.sprite?.destroy(); } catch {}
  state = null;
}

async function placeHere(point, hidden) {
  if ( !state || state.busy ) return;
  state.busy = true;
  const { item, fromActor } = state;
  const payload = {
    sceneId: canvas.scene.id,
    point: { x: Math.round(point.x), y: Math.round(point.y) },
    hidden,
    rotation: state.rotation,
    size: state.size
  };
  if ( fromActor ) payload.itemUuid = item.uuid;
  else payload.itemData = groundItemData(item);

  let res = null;
  try { res = await gmHandlers.place(payload, game.user.id); }
  catch(err) { console.error(`${MODULE_ID} |`, err); }
  if ( !state ) return;
  state.busy = false;

  if ( !res?.ok ) {
    ui.notifications.warn(L(res?.reason === "type" ? "Warn.NotPhysical" : "Warn.ItemGone"));
    return endPlacement();
  }
  // An item from an inventory exists only once – it now lies on the ground
  if ( fromActor ) return endPlacement();
  // For the next copy: a new random tilt, unless the GM turned it by hand
  if ( !state.rotationTouched ) state.rotation = startRotation();
  drawPreview();
}

/* -------------------------------------------- */
/*  Input while placing                          */
/* -------------------------------------------- */

function onPointerMove(event) {
  if ( !state || !canvas?.ready ) return;
  if ( !isCanvasTarget(event) ) {
    state.point = null;
    return drawPreview();
  }
  state.point = toCanvas(event);
  drawPreview();
}

function onPointerDown(event) {
  if ( !state ) return;
  if ( !isCanvasTarget(event) ) return;
  event.stopImmediatePropagation();
  event.preventDefault();
  if ( event.button === 2 ) return endPlacement();
  if ( event.button !== 0 ) return;
  placeHere(toCanvas(event), !!event.altKey);
}

function swallow(event) {
  if ( state && isCanvasTarget(event) ) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

function onContextMenu(event) {
  if ( state && isCanvasTarget(event) ) event.preventDefault();
}

function onKeyDown(event) {
  if ( state && (event.key === "Escape") ) {
    event.stopImmediatePropagation();
    event.preventDefault();
    endPlacement();
  }
}

/** Wheel = rotate (Shift = fine), Alt + wheel = bigger / smaller. */
function onWheel(event) {
  if ( !state || !isCanvasTarget(event) || event.ctrlKey || event.metaKey ) return;
  const delta = event.deltaY || event.deltaX;
  if ( !delta ) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const dir = Math.sign(delta);
  if ( event.altKey ) {
    state.size = Math.round(Math.clamp(state.size - (dir * setting("wheelScaleStep")), MIN_SIZE, MAX_SIZE) * 100) / 100;
  } else {
    const step = event.shiftKey ? setting("wheelStepFine") : setting("wheelStep");
    state.rotation = (((state.rotation + (dir * step)) % 360) + 360) % 360;
    state.rotationTouched = true;
  }
  drawPreview();
}

/* ============================================ */
/*  Right-click menus                           */
/* ============================================ */

const MENU_ICON = "fa-solid fa-hand-holding";

/** Items sidebar and compendiums (core hook, used for both). */
function onDirectoryContext(app, options) {
  const isPack = app.collection instanceof foundry.documents.collections.CompendiumCollection;
  options.push({
    label: `${MODULE_ID}.Place.Menu`,
    icon: MENU_ICON,
    visible: li => {
      if ( !game.user.isGM ) return false;
      const id = li?.dataset?.entryId;
      const entry = isPack ? app.collection.index.get(id) : game.items.get(id);
      return !!entry && PHYSICAL_TYPES.includes(entry.type);
    },
    onClick: async (_event, li) => {
      const id = li?.dataset?.entryId;
      const item = isPack ? await app.collection.getDocument(id) : game.items.get(id);
      startPlacement(item);
    }
  });
}

/** Inventory on character / NPC sheets (dnd5e hook). */
function onSheetItemContext(item, menuItems) {
  if ( !game.user.isGM || !PHYSICAL_TYPES.includes(item?.type) ) return;
  menuItems.push({
    label: `${MODULE_ID}.Place.MenuFromSheet`,
    icon: MENU_ICON,
    visible: () => true,
    onClick: () => startPlacement(item)
  });
}

export function registerPlacement() {
  Hooks.on("getItemContextOptions", onDirectoryContext);
  Hooks.on("dnd5e.getItemContextOptions", onSheetItemContext);
  Hooks.on("canvasTearDown", () => endPlacement());

  window.addEventListener("pointermove", onPointerMove, { capture: true });
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointerup", swallow, { capture: true });
  window.addEventListener("dblclick", swallow, { capture: true });
  window.addEventListener("contextmenu", onContextMenu, { capture: true });
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
}
