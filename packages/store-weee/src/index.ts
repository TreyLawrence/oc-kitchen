import { createOrderWeeeTool } from "./tools/order-weee.js";

interface PluginApi {
  registerTool(tool: unknown): void;
}

const plugin = {
  id: "oc-kitchen-weee",
  name: "OC Kitchen — Weee!",
  description: "Automated grocery ordering from Weee! via computer-use agent",

  register(api: PluginApi) {
    api.registerTool(createOrderWeeeTool());
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
