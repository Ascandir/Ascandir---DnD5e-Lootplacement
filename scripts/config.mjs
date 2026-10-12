export const MODULE_ID = "ascandir-dnd5e-lootplacement";
export const SOCKET = `module.${MODULE_ID}`;

/** Item types that can lie on the ground (physical items only). */
export const PHYSICAL_TYPES = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/** Localize helper. */
export function L(key, data) {
  const full = `${MODULE_ID}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

export function registerSettings() {
  const reg = (key, type, def, extra = {}) => game.settings.register(MODULE_ID, key, {
    name: `${MODULE_ID}.Settings.${key}.Name`,
    hint: `${MODULE_ID}.Settings.${key}.Hint`,
    scope: "world",
    config: true,
    type,
    default: def,
    ...extra
  });

  // --- Platzieren ---
  reg("enableDrop", Boolean, true);
  reg("dropKey", String, "none", {
    choices: {
      none: `${MODULE_ID}.Key.none`,
      alt: `${MODULE_ID}.Key.alt`,
      shift: `${MODULE_ID}.Key.shift`,
      ctrl: `${MODULE_ID}.Key.ctrl`
    }
  });
  reg("playersCanDrop", Boolean, true);
  reg("dropRange", Number, 5, { range: { min: 0, max: 60, step: 5 } });

  // --- Aufheben ---
  reg("pickupRange", Number, 5, { range: { min: 0, max: 30, step: 5 } });
  reg("askQuantity", Boolean, true);

  // --- Aussehen ---
  reg("groundSize", Number, 0.4, { range: { min: 0.15, max: 1, step: 0.05 } });
  reg("randomRotation", Boolean, true);
  reg("wheelRotate", Boolean, true);
  reg("wheelStep", Number, 15, { range: { min: 1, max: 90, step: 1 } });
  reg("wheelStepFine", Number, 3, { range: { min: 1, max: 45, step: 1 } });
  reg("wheelScaleStep", Number, 0.05, { range: { min: 0.01, max: 0.5, step: 0.01 } });

  // Remembered pictures / sizes per item (set in the "Bild & Größe" dialog)
  game.settings.register(MODULE_ID, "appearanceMemory", { scope: "world", config: false, type: Object, default: {} });

  // --- Chat ---
  reg("chatMessages", Boolean, true);
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Feet → canvas pixels. */
export function ftToPx(ft) {
  return (ft / canvas.dimensions.distance) * canvas.dimensions.size;
}

/** Grid cells covered by a token: {r0, r1, c0, c1} (inclusive). */
function cellRect(token) {
  const b = token.bounds;
  const inset = Math.min(2, b.width / 4, b.height / 4);
  const a = canvas.grid.getOffset({ x: b.left + inset, y: b.top + inset });
  const z = canvas.grid.getOffset({ x: b.right - inset, y: b.bottom - inset });
  return { r0: Math.min(a.i, z.i), r1: Math.max(a.i, z.i), c0: Math.min(a.j, z.j), c1: Math.max(a.j, z.j) };
}

/**
 * Distance between two tokens the way it's counted at the table:
 * on a square grid by squares (neighbouring square, also diagonal = one grid step),
 * otherwise edge to edge plus one grid step.
 */
export function tokenGapDistance(a, b) {
  const d = canvas.dimensions.distance;
  if ( canvas.grid.isSquare ) {
    try {
      const A = cellRect(a);
      const B = cellRect(b);
      const dr = Math.max(0, B.r0 - A.r1, A.r0 - B.r1);
      const dc = Math.max(0, B.c0 - A.c1, A.c0 - B.c1);
      return Math.max(dr, dc) * d;
    } catch(err) {
      console.warn(`${MODULE_ID} |`, err);
    }
  }
  const ab = a.bounds;
  const bb = b.bounds;
  const dx = Math.max(0, bb.left - ab.right, ab.left - bb.right);
  const dy = Math.max(0, bb.top - ab.bottom, ab.top - bb.bottom);
  return ((Math.hypot(dx, dy) / canvas.dimensions.size) * d) + d;
}

/** Distance in ft between a token and a canvas point (0 = inside the token). */
export function tokenPointDistance(token, point) {
  const d = canvas.dimensions.distance;
  if ( canvas.grid.isSquare ) {
    try {
      const A = cellRect(token);
      const p = canvas.grid.getOffset(point);
      const dr = Math.max(0, p.i - A.r1, A.r0 - p.i);
      const dc = Math.max(0, p.j - A.c1, A.c0 - p.j);
      return Math.max(dr, dc) * d;
    } catch {}
  }
  const b = token.bounds;
  const dx = Math.max(0, b.left - point.x, point.x - b.right);
  const dy = Math.max(0, b.top - point.y, point.y - b.bottom);
  return (Math.hypot(dx, dy) / canvas.dimensions.size) * d;
}

/** Is the given token one of our ground item tokens? */
export function isGroundToken(token) {
  return !!(token?.document ?? token)?.getFlag?.(MODULE_ID, "ground");
}

/** Ground tokens of other modules (e.g. Persistent Thrown Weapons) are never used as acting tokens either. */
function isAnyGroundToken(token) {
  const doc = token?.document ?? token;
  if ( !doc ) return false;
  if ( isGroundToken(doc) ) return true;
  return !!doc.getFlag?.("ascandir-persistent-thrown-weapons", "ground");
}

/** The token the current user acts with (pick up / drop). */
let lastActingTokenId = null;
export function rememberActingToken(token, controlled) {
  if ( controlled && token?.actor && !isAnyGroundToken(token) ) lastActingTokenId = token.id;
}

export function getActingToken() {
  const controlled = canvas.tokens.controlled.find(t => t.actor && !isAnyGroundToken(t) && t.actor.isOwner);
  if ( controlled ) return controlled;
  if ( game.user.isGM ) return null; // the GM acts only with a selected token
  const last = lastActingTokenId ? canvas.tokens.get(lastActingTokenId) : null;
  if ( last?.actor?.isOwner ) return last;
  return game.user.character?.getActiveTokens?.(true)?.[0] ?? null;
}

/** Name players see: unidentified items keep their secret. */
export function displayName(itemData) {
  const sys = itemData?.system ?? {};
  if ( sys.identified === false ) return sys.unidentified?.name || L("Unknown");
  return itemData?.name ?? "?";
}

/** Label of a ground stack, e.g. "Heiltrank ×3". */
export function stackLabel(itemData) {
  const qty = Number(itemData?.system?.quantity) || 1;
  const name = displayName(itemData);
  return qty > 1 ? `${name} ×${qty}` : name;
}

/** Clean item data for the ground (no id, unequipped, not in a container). */
export function groundItemData(item, quantity) {
  const data = item.toObject ? item.toObject() : foundry.utils.deepClone(item);
  delete data._id;
  delete data._stats;
  data.system ??= {};
  data.system.quantity = Math.max(1, quantity ?? data.system.quantity ?? 1);
  if ( "equipped" in data.system ) data.system.equipped = false;
  if ( "container" in data.system ) data.system.container = null;
  if ( data.flags?.dnd5e?.last ) delete data.flags.dnd5e.last;
  return data;
}

/** Two item data objects describe the same kind of thing (so they may be stacked). */
export function sameItem(a, b) {
  if ( !a || !b ) return false;
  return (a.type === b.type) && (a.name === b.name) && (a.img === b.img)
    && ((a.system?.identified ?? true) === (b.system?.identified ?? true));
}

export function randomBetween(a, b) {
  return a + (Math.random() * (b - a));
}
