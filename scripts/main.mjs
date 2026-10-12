import { MODULE_ID, registerSettings, rememberActingToken } from "./config.mjs";
import { registerSocket } from "./net.mjs";
import { registerInput, registerDrop } from "./input.mjs";
import { api } from "./ground.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  registerSocket();
  registerInput();
  registerDrop();
  Hooks.on("controlToken", (token, controlled) => rememberActingToken(token, controlled));
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = api;
  console.log(`${MODULE_ID} | ready`);
});
