import { MODULE_ID, registerSettings, rememberActingToken } from "./config.mjs";
import { registerSocket } from "./net.mjs";
import { registerInput } from "./input.mjs";
import { registerPlacement } from "./placement.mjs";
import { api } from "./ground.mjs";
import { registerAppearance } from "./appearance.mjs";

Hooks.once("init", () => {
  registerSettings();
  // Right-click menus are built when the sidebar renders, so register early
  registerPlacement();
});

Hooks.once("ready", () => {
  registerSocket();
  registerInput();
  registerAppearance();
  Hooks.on("controlToken", (token, controlled) => rememberActingToken(token, controlled));
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = api;
  console.log(`${MODULE_ID} | ready`);
});
