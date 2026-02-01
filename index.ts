// NoChat Channel Plugin - Entry Point
// Phase 1: Polling Transport + Trust Model

import { NoChatChannel } from "./src/channel.js";

export default {
  id: "nochat-channel",
  name: "NoChat Channel",
  description: "NoChat encrypted messaging channel for agent-to-agent communication",
  configSchema: {},
  register(api: unknown) {
    // Plugin registration would use OpenClaw Plugin SDK:
    // const pluginApi = api as OpenClawPluginApi;
    // const config = pluginApi.config.channels?.nochat;
    // if (!config?.enabled) return;
    // const channel = new NoChatChannel(config);
    // pluginApi.registerChannel({ plugin: channel.getPlugin() });
    // pluginApi.registerService({
    //   id: "nochat-transport",
    //   start: () => channel.startTransport(),
    //   stop: () => channel.stopTransport(),
    // });
    console.log("[NoChat] Plugin registered (Phase 1 — Polling + Trust)");
  },
};

export { NoChatChannel } from "./src/channel.js";
export { TrustManager } from "./src/trust/manager.js";
export { TrustStore } from "./src/trust/store.js";
export { SessionRouter } from "./src/session/router.js";
export { NoChatApiClient } from "./src/api/client.js";
export { PollingTransport } from "./src/transport/polling.js";
export type {
  TrustTier,
  NoChatConfig,
  NoChatMessage,
  NoChatConversation,
  TrustConfig,
  SessionConfig,
  ResolvedNoChatAccount,
} from "./src/types.js";
