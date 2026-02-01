// NoChat Channel Plugin — Entry Point
// Wires the NoChat channel plugin into OpenClaw's plugin SDK.

import { noChatPlugin } from "./src/plugin.js";

const plugin = {
  id: "nochat-channel",
  name: "NoChat Channel",
  description: "NoChat encrypted messaging channel for agent-to-agent communication",
  configSchema: {
    type: "object",
    properties: {
      serverUrl: { type: "string" },
      apiKey: { type: "string" },
      agentName: { type: "string" },
      agentId: { type: "string" },
      transport: { type: "string", enum: ["auto", "polling", "webhook", "websocket"] },
      polling: {
        type: "object",
        properties: {
          intervalMs: { type: "number", default: 15000 },
          activeIntervalMs: { type: "number", default: 5000 },
          idleIntervalMs: { type: "number", default: 60000 },
        },
      },
      webhook: {
        type: "object",
        properties: {
          path: { type: "string", default: "/nochat-webhook" },
          secret: { type: "string" },
        },
      },
      trust: { type: "object" },
      sessions: { type: "object" },
      crypto: { type: "object" },
      rateLimits: { type: "object" },
    },
    required: ["serverUrl", "apiKey", "agentName"],
  },
  register(api: any) {
    api.registerChannel({ plugin: noChatPlugin });
    api.registerService({
      id: "nochat-transport",
      start: () => {
        console.log("[NoChat] Transport service started");
      },
      stop: () => {
        console.log("[NoChat] Transport service stopped");
      },
    });
  },
};

export default plugin;

// Re-export public API for consumers
export { NoChatChannel } from "./src/channel.js";
export { TrustManager } from "./src/trust/manager.js";
export { TrustStore } from "./src/trust/store.js";
export { SessionRouter } from "./src/session/router.js";
export { NoChatApiClient } from "./src/api/client.js";
export { PollingTransport } from "./src/transport/polling.js";
export { noChatPlugin } from "./src/plugin.js";
export {
  listNoChatAccountIds,
  resolveNoChatAccount,
  resolveDefaultNoChatAccountId,
} from "./src/accounts.js";
export {
  normalizeNoChatTarget,
  looksLikeNoChatTargetId,
  parseNoChatTarget,
} from "./src/targets.js";
export type {
  TrustTier,
  NoChatConfig,
  NoChatMessage,
  NoChatConversation,
  TrustConfig,
  SessionConfig,
  ResolvedNoChatAccount,
} from "./src/types.js";
