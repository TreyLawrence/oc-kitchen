import { createCustomizeButcherBoxTool } from "./tools/customize-butcherbox.js";

interface PluginApi {
  registerTool(tool: unknown): void;
}

const plugin = {
  id: "oc-kitchen-butcherbox",
  name: "OC Kitchen — ButcherBox",
  description: "Manage ButcherBox meat subscription — customize upcoming boxes based on meal plans",

  register(api: PluginApi) {
    api.registerTool(createCustomizeButcherBoxTool());
  },
};

async function loadEntry() {
  try {
    const mod = await import("openclaw/plugin-sdk/plugin-entry");
    if (typeof mod.definePluginEntry === "function") {
      return mod.definePluginEntry(plugin);
    }
  } catch {
    // openclaw not available
  }
  return plugin;
}

export default await loadEntry();
