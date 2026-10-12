import {
  MODULE_ID, L, setting, PHYSICAL_TYPES, tokenGapDistance, getActingToken,
  groundItemData, sameItem, stackLabel, displayName, randomBetween
} from "./config.mjs";
import { requestGM, gmHandlers } from "./net.mjs";
import { TOKEN_SIZE, rememberedLook, scaleForSize } from "./appearance.mjs";

/* ============================================ */
/*  GM side                                     */
/* ============================================ */

async function chat(content) {
  if ( !setting("chatMessages") ) return;
  await ChatMessage.create({ content: `<p>${content}</p>`, speaker: { alias: L("ChatAlias") } });
}

/** Give items to an actor, stacking onto an identical item where possible. */
async function giveItem(actor, itemData, quantity) {
  const existing = actor.items.find(i => sameItem(i, itemData) && !i.system.container);
  if ( existing ) {
    await existing.update({ "system.quantity": (existing.system.quantity ?? 0) + quantity });
    return existing;
  }
  const data = foundry.utils.deepClone(itemData);
  data.system.quantity = quantity;
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/** Remove a number of pieces of an item from an actor. */
async function takeFrom(item, quantity) {
  const qty = item.system.quantity ?? 1;
  if ( qty > quantity ) await item.update({ "system.quantity": qty - quantity });
  else await item.delete();
}

/** An existing ground stack of the same item right at this point. */
function stackAt(scene, point, itemData) {
  const gs = scene.grid.size;
  return scene.tokens.find(t => {
    const g = t.getFlag(MODULE_ID, "ground");
    if ( !g || !sameItem(g.itemData, itemData) ) return false;
    const cx = t.x + ((t.width * gs) / 2);
    const cy = t.y + ((t.height * gs) / 2);
    return Math.hypot(point.x - cx, point.y - cy) <= gs * 0.2;
  }) ?? null;
}

async function createGroundToken(scene, point, itemData, { hidden = false, rotation = null, size = null } = {}) {
  const gs = scene.grid.size;
  const look = rememberedLook(itemData);
  const scale = scaleForSize(size ?? look?.size ?? setting("groundSize"));
  const modes = CONST.TOKEN_DISPLAY_MODES;
  if ( rotation === null ) rotation = setting("randomRotation") ? randomBetween(-35, 35) : 0;
  const data = {
    name: stackLabel(itemData),
    x: Math.round(point.x - ((gs * TOKEN_SIZE) / 2)),
    y: Math.round(point.y - ((gs * TOKEN_SIZE) / 2)),
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    hidden,
    texture: { src: look?.src || itemData.img, scaleX: scale, scaleY: scale },
    rotation: ((Math.round(rotation) % 360) + 360) % 360,
    lockRotation: false,
    displayName: modes.HOVER,
    displayBars: modes.NONE,
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    bar1: { attribute: null },
    bar2: { attribute: null },
    sight: { enabled: false },
    actorLink: false,
    flags: { [MODULE_ID]: { ground: { itemData } } }
  };
  const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
  return doc;
}

/** Put a stack onto the ground (merging with an identical stack lying right there). */
async function putOnGround(scene, point, itemData, opts) {
  const stack = stackAt(scene, point, itemData);
  if ( stack && (!!stack.hidden === !!opts.hidden) ) {
    const g = foundry.utils.deepClone(stack.getFlag(MODULE_ID, "ground"));
    g.itemData.system.quantity = (Number(g.itemData.system.quantity) || 1) + (Number(itemData.system.quantity) || 1);
    await stack.update({ name: stackLabel(g.itemData), [`flags.${MODULE_ID}.ground`]: g });
    return stack;
  }
  return createGroundToken(scene, point, itemData, opts);
}

/**
 * Place an item on the ground. GM only.
 * - itemUuid of an item owned by an actor → the item is moved out of that inventory.
 * - itemUuid of a sidebar / compendium item, or itemData → a copy is placed.
 */
gmHandlers.place = async ({ sceneId, point, itemUuid, itemData, quantity, hidden, rotation, size }, userId) => {
  const scene = game.scenes.get(sceneId);
  const user = game.users.get(userId);
  if ( !scene || !user?.isGM ) return { ok: false, reason: "permission" };

  const item = itemUuid ? await fromUuid(itemUuid) : null;
  if ( itemUuid && !item ) return { ok: false, reason: "gone" };
  const owner = (item?.parent instanceof Actor) ? item.parent : null;

  const source = item ?? itemData;
  if ( !source || !PHYSICAL_TYPES.includes(source.type) ) return { ok: false, reason: "type" };

  let qty = Math.max(1, Math.floor(Number(quantity ?? source.system?.quantity) || 1));
  if ( owner ) qty = Math.min(qty, item.system.quantity ?? 1);
  const data = groundItemData(source, qty);

  if ( owner ) await takeFrom(item, qty);
  await putOnGround(scene, point, data, { hidden: !!hidden, rotation: rotation ?? null, size: size ?? null });
  return { ok: true, moved: !!owner };
};

gmHandlers.pickup = async ({ sceneId, tokenId, actorUuid, pickerTokenId, quantity }, userId) => {
  const scene = game.scenes.get(sceneId);
  const tDoc = scene?.tokens.get(tokenId);
  const ground = tDoc?.getFlag(MODULE_ID, "ground");
  if ( !ground ) return { ok: false, reason: "gone" };
  const user = game.users.get(userId);
  if ( tDoc.hidden && !user?.isGM ) return { ok: false, reason: "gone" };

  // Second range check on the GM's side (only possible when the GM looks at the same scene)
  if ( (canvas.scene?.id === sceneId) && pickerTokenId ) {
    const a = canvas.tokens.get(pickerTokenId);
    const b = tDoc.object;
    if ( a && b && (tokenGapDistance(a, b) > (setting("pickupRange") + 0.01)) ) return { ok: false, reason: "range" };
  }
  const actor = await fromUuid(actorUuid);
  if ( !actor || !user || !actor.testUserPermission(user, "OWNER") ) return { ok: false, reason: "permission" };

  const total = Number(ground.itemData.system?.quantity) || 1;
  const take = Math.clamp(Math.floor(Number(quantity) || total), 1, total);
  const rest = total - take;

  if ( rest > 0 ) {
    const g = foundry.utils.deepClone(ground);
    g.itemData.system.quantity = rest;
    await tDoc.update({ name: stackLabel(g.itemData), [`flags.${MODULE_ID}.ground`]: g });
  } else {
    await tDoc.delete();
  }
  await giveItem(actor, ground.itemData, take);
  const label = take > 1 ? `${displayName(ground.itemData)} ×${take}` : displayName(ground.itemData);
  await chat(L("Chat.PickedUp", { actor: actor.name, item: label }));
  return { ok: true };
};

/* ============================================ */
/*  Client side                                 */
/* ============================================ */

/** Double-click on a ground item. */
export async function pickUp(groundToken) {
  const picker = getActingToken();
  if ( !picker ) return ui.notifications.warn(L("Warn.SelectToken"));
  const range = setting("pickupRange");
  const dist = tokenGapDistance(picker, groundToken);
  if ( dist > (range + 0.01) ) return ui.notifications.warn(L("Warn.TooFar", { range }));

  const ground = groundToken.document.getFlag(MODULE_ID, "ground");
  const total = Number(ground?.itemData?.system?.quantity) || 1;
  let quantity = total;
  if ( (total > 1) && setting("askQuantity") ) {
    quantity = await askPickupQuantity(displayName(ground.itemData), total);
    if ( !quantity ) return;
  }

  const res = await requestGM("pickup", {
    sceneId: canvas.scene.id, tokenId: groundToken.id, actorUuid: picker.actor.uuid, pickerTokenId: picker.id, quantity
  }).catch(err => { console.error(err); return null; });
  if ( res && !res.ok ) {
    const key = { permission: "Warn.NoPermission", range: "Warn.TooFar" }[res.reason] ?? "Warn.ItemGone";
    ui.notifications.warn(L(key, { range }));
  }
}

async function askPickupQuantity(name, total) {
  const DialogV2 = foundry.applications.api.DialogV2;
  try {
    const res = await DialogV2.wait({
      window: { title: name, icon: "fa-solid fa-hand" },
      content: `<div class="form-group">
        <label>${L("Dialog.PickupQuantity", { total })}</label>
        <div class="form-fields"><input type="number" name="qty" value="${total}" min="1" max="${total}" step="1" autofocus></div>
      </div>`,
      buttons: [
        {
          action: "ok", label: L("Dialog.PickUp"), icon: "fa-solid fa-hand", default: true,
          callback: (event, button) => Number(button.form.elements.qty.value) || total
        },
        { action: "all", label: L("Dialog.PickUpAll", { total }), icon: "fa-solid fa-hands", callback: () => total },
        { action: "cancel", label: L("Dialog.Cancel"), icon: "fa-solid fa-xmark", callback: () => 0 }
      ],
      rejectClose: false
    });
    return Math.clamp(Number(res) || 0, 0, total);
  } catch {
    return 0;
  }
}

/** GM double-click: show the item (read-only preview). */
export async function previewGroundItem(groundToken) {
  const ground = groundToken.document.getFlag(MODULE_ID, "ground");
  if ( !ground?.itemData ) return;
  try {
    const item = new CONFIG.Item.documentClass(foundry.utils.deepClone(ground.itemData));
    item.sheet.render(true);
    ui.notifications.info(L("Info.Preview"));
  } catch(err) {
    console.error(`${MODULE_ID} |`, err);
  }
}

/** Small public API, e.g. for macros: game.modules.get("ascandir-dnd5e-lootplacement").api */
export const api = {
  /**
   * Place an item (Item document, uuid or item data) on the current scene. GM only.
   * @example game.modules.get("ascandir-dnd5e-lootplacement").api.place("Compendium.dnd5e.items.Item.xyz", {x: 1000, y: 800}, {quantity: 2})
   */
  async place(itemOrUuid, point, { quantity = 1, hidden = false, rotation = null, size = null, sceneId } = {}) {
    if ( !game.user.isGM ) throw new Error("GM only");
    const item = (typeof itemOrUuid === "string") ? await fromUuid(itemOrUuid) : itemOrUuid;
    if ( !item ) throw new Error("Item not found");
    const payload = { sceneId: sceneId ?? canvas.scene.id, point, quantity, hidden, rotation, size };
    if ( item.parent instanceof Actor ) payload.itemUuid = item.uuid;
    else payload.itemData = groundItemData(item, quantity);
    return gmHandlers.place(payload, game.user.id);
  }
};
