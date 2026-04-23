interface PluginApi {
  registerTool(tool: unknown): void;
}

const plugin = {
  id: "oc-kitchen-wegmans",
  name: "OC Kitchen — Wegmans",
  description: "Automated grocery ordering from Wegmans via computer-use agent",

  register(api: PluginApi) {
    // order_wegmans tool will be registered here
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
