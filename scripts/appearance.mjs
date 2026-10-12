import { MODULE_ID, L, setting, isGroundToken, displayName } from "./config.mjs";

/** Ground tokens are always half a grid square; their visible size comes from the texture scale. */
export const TOKEN_SIZE = 0.5;
export const MIN_SIZE = 0.1;
export const MAX_SIZE = 4;

/* ============================================ */
/*  Remembered looks per item ("Heiltrank" etc.) */
/* ============================================ */

function memoryKey(itemData) {
  return `${itemData?.type ?? ""}|${itemData?.name ?? ""}`;
}

function getMemory() {
  try { return foundry.utils.deepClone(setting("appearanceMemory") ?? {}); } catch { return {}; }
}

/** Remembered {src, size} for this kind of item, if the GM saved one. */
export function rememberedLook(itemData) {
  return getMemory()[memoryKey(itemData)] ?? null;
}

async function saveLook(itemData, look) {
  const mem = getMemory();
  if ( look ) mem[memoryKey(itemData)] = look;
  else delete mem[memoryKey(itemData)];
  await game.settings.set(MODULE_ID, "appearanceMemory", mem);
}

/* ============================================ */
/*  Size helpers                                */
/* ============================================ */

/** Visible size of a ground token in grid squares. */
export function lookSize(doc) {
  const s = Math.max(Math.abs(doc.texture?.scaleX ?? 1), Math.abs(doc.texture?.scaleY ?? 1));
  return Math.round(s * (doc.width ?? TOKEN_SIZE) * 100) / 100;
}

/** Texture update for a size in grid squares (keeps a mirrored image mirrored). */
export function sizeUpdate(doc, size) {
  const s = Math.clamp(size, MIN_SIZE, MAX_SIZE) / (doc?.width ?? TOKEN_SIZE);
  const sx = Math.sign(doc?.texture?.scaleX ?? 1) || 1;
  const sy = Math.sign(doc?.texture?.scaleY ?? 1) || 1;
  return { "texture.scaleX": s * sx, "texture.scaleY": s * sy };
}

/** Texture scale for a new ground token. */
export function scaleForSize(size) {
  return Math.clamp(size, MIN_SIZE, MAX_SIZE) / TOKEN_SIZE;
}

/* ============================================ */
/*  Dialog: picture & size                      */
/* ============================================ */

export async function editAppearance(tokenDoc) {
  if ( !game.user.isGM ) return;
  const ground = tokenDoc.getFlag(MODULE_ID, "ground");
  if ( !ground ) return;
  const itemData = ground.itemData;
  const name = displayName(itemData);
  const src = tokenDoc.texture?.src ?? itemData.img;
  const size = lookSize(tokenDoc);
  const remembered = !!rememberedLook(itemData);
  const esc = s => foundry.utils.escapeHTML?.(String(s)) ?? String(s);

  const content = `
    <div class="alp-appearance">
      <div class="form-group">
        <label>${L("Appearance.Image")}</label>
        <div class="form-fields"><file-picker name="src" type="image" value="${esc(src)}"></file-picker></div>
        <p class="hint">${L("Appearance.ImageHint")}</p>
      </div>
      <div class="form-group">
        <label>${L("Appearance.Size")}</label>
        <div class="form-fields"><range-picker name="size" min="${MIN_SIZE}" max="${MAX_SIZE}" step="0.05" value="${size}"></range-picker></div>
        <p class="hint">${L("Appearance.SizeHint")}</p>
      </div>
      <div class="form-group">
        <label>${L("Appearance.Remember", { name: esc(name) })}</label>
        <div class="form-fields"><input type="checkbox" name="remember" ${remembered ? "checked" : ""}></div>
        <p class="hint">${L("Appearance.RememberHint")}</p>
      </div>
    </div>`;

  const DialogV2 = foundry.applications.api.DialogV2;
  let res;
  try {
    res = await DialogV2.wait({
      window: { title: L("Appearance.Title", { name }), icon: "fa-solid fa-image" },
      position: { width: 480 },
      content,
      buttons: [
        {
          action: "save", label: L("Appearance.Save"), icon: "fa-solid fa-floppy-disk", default: true,
          callback: (event, button) => {
            const f = button.form.elements;
            return {
              action: "save",
              src: String(f.src?.value ?? "").trim(),
              size: Number(f.size?.value) || size,
              remember: !!f.remember?.checked
            };
          }
        },
        { action: "reset", label: L("Appearance.Reset"), icon: "fa-solid fa-rotate-left", callback: () => ({ action: "reset" }) },
        { action: "cancel", label: L("Dialog.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
  } catch { res = null; }
  if ( !res || (res === "cancel") ) return;

  if ( res.action === "reset" ) {
    await tokenDoc.update({ "texture.src": itemData.img, ...sizeUpdate(tokenDoc, setting("groundSize")) });
    if ( remembered ) await saveLook(itemData, null);
    return;
  }

  const newSrc = res.src || itemData.img;
  await tokenDoc.update({ "texture.src": newSrc, ...sizeUpdate(tokenDoc, res.size) });
  if ( res.remember ) await saveLook(itemData, { src: newSrc, size: Math.clamp(res.size, MIN_SIZE, MAX_SIZE) });
  else if ( remembered ) await saveLook(itemData, null);
}

/* ============================================ */
/*  Token HUD button                            */
/* ============================================ */

function onRenderTokenHUD(hud, html) {
  if ( !game.user.isGM ) return;
  const doc = hud.document ?? hud.object?.document;
  if ( !isGroundToken(doc) ) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector?.(".col.left") ?? root?.querySelector?.(".col");
  if ( !col || col.querySelector(".alp-appearance-btn") ) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon alp-appearance-btn";
  btn.dataset.tooltip = L("Appearance.HudTooltip");
  btn.innerHTML = `<i class="fa-solid fa-image"></i>`;
  btn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    hud.close?.();
    editAppearance(doc);
  });
  col.appendChild(btn);
}

export function registerAppearance() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}
