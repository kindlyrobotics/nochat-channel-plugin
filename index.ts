// NoChat Channel Plugin — Entry Point
// Wires the NoChat channel plugin into OpenClaw's plugin SDK.

import { noChatPlugin } from "./src/plugin.js";
import { setNoChatRuntime, getNoChatRuntime } from "./src/runtime.js";
import { NoChatApiClient } from "./src/api/client.js";
import { PollingTransport } from "./src/transport/polling.js";
import type { NoChatMessage } from "./src/types.js";

// Track active transports for cleanup
const activeTransports = new Map<string, PollingTransport>();

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
    // Store the runtime for message dispatch (same pattern as BlueBubbles)
    setNoChatRuntime(api.runtime);
    api.registerChannel({ plugin: noChatPlugin });
    api.registerService({
      id: "nochat-transport",
      start: () => {
        console.log("[NoChat] Transport service started");
      },
      stop: () => {
        // Stop all active transports
        for (const [id, transport] of activeTransports) {
          transport.stop();
          console.log(`[NoChat] Stopped transport for account ${id}`);
        }
        activeTransports.clear();
        console.log("[NoChat] Transport service stopped");
      },
    });
  },
};

// Override startAccount to wire up real polling + dispatch
noChatPlugin.gateway.startAccount = async (ctx: any) => {
  const account = ctx.account;
  const config = account.config;

  if (!config?.serverUrl || !config?.apiKey) {
    ctx.log?.warn?.(`[nochat:${account.accountId}] not configured — skipping`);
    return;
  }

  ctx.setStatus?.({
    accountId: account.accountId,
    baseUrl: config.serverUrl,
  });

  ctx.log?.info?.(`[nochat:${account.accountId}] starting polling transport`);

  // Create API client and polling transport
  const client = new NoChatApiClient(config.serverUrl, config.apiKey);

  // Resolve our own user_id from conversation participants (agentId is the agent UUID,
  // but messages use sender_id which is the user UUID — they're different)
  let selfUserId = config.userId; // Allow explicit config
  if (!selfUserId) {
    try {
      const convos = await client.listConversations();
      if (convos.length > 0 && convos[0].participants) {
        // Find participant matching our agent name
        const me = convos[0].participants.find(
          (p: any) => p.username === `agent:${config.agentName}` || p.username === config.agentName
        );
        if (me) {
          selfUserId = me.user_id;
          console.log(`[NoChat] Resolved self user_id: ${selfUserId}`);
        }
      }
    } catch (err) {
      console.log(`[NoChat] Could not resolve self user_id: ${(err as Error).message}`);
    }
  }
  const transport = new PollingTransport(client, config.polling ?? {}, selfUserId);

  // Wire up inbound message handling
  transport.onMessage(async (msg: NoChatMessage) => {
    try {
      await handleNoChatInbound(ctx, account, config, client, msg);
    } catch (err) {
      console.error(`[NoChat] Error handling inbound message: ${(err as Error).message}`);
    }
  });

  await transport.start();
  activeTransports.set(account.accountId, transport);

  // Clean up on abort
  ctx.abortSignal?.addEventListener?.("abort", () => {
    transport.stop();
    activeTransports.delete(account.accountId);
  });
};

/**
 * Handle an inbound NoChat message — resolve route, format, dispatch to agent session.
 */
async function handleNoChatInbound(
  ctx: any,
  account: any,
  config: any,
  client: NoChatApiClient,
  msg: NoChatMessage,
): Promise<void> {
  const core = getNoChatRuntime();
  const senderName = msg.sender_name || msg.sender_id.slice(0, 8);
  const senderId = msg.sender_id;

  // Decode message content
  let text: string;
  try {
    const raw = msg.encrypted_content || "";
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    // Handle double base64 encoding
    try {
      const double = Buffer.from(decoded, "base64").toString("utf-8");
      // If double-decoded looks like text (not gibberish), use it
      text = /^[\x20-\x7E\n\r\t]/.test(double) && double.length > 0 ? double : decoded;
    } catch {
      text = decoded;
    }
  } catch {
    text = msg.encrypted_content || "[unreadable message]";
  }

  console.log(`[NoChat] Inbound from ${senderName}: ${text.slice(0, 80)}...`);

  // Resolve agent route (session key)
  const route = core.channel.routing.resolveAgentRoute({
    cfg: ctx.cfg,
    channel: "nochat",
    accountId: account.accountId,
    peer: { kind: "dm", id: senderId },
  });

  // Format the inbound envelope
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(ctx.cfg);
  const storePath = core.channel.session.resolveStorePath(ctx.cfg?.session?.store, {
    agentId: route.agentId,
  });
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "NoChat",
    from: senderName,
    timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
    previousTimestamp,
    envelope: envelopeOptions,
    body: text,
  });

  // Build the ctx payload (same shape BlueBubbles uses)
  const ctxPayload = {
    Body: body,
    BodyForAgent: body,
    RawBody: text,
    CommandBody: text,
    BodyForCommands: text,
    From: `nochat:${senderId}`,
    To: `nochat:${config.agentId || config.agentName}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: senderName,
    SenderName: senderName,
    SenderId: senderId,
    Provider: "nochat",
    Surface: "nochat",
    MessageSid: msg.id,
    CommandAuthorized: true, // Trust tiers handle authorization
  };

  // Dispatch: pushes inbound to agent, waits for reply, delivers reply back to NoChat
  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: ctx.cfg,
    dispatcherOptions: {
      deliver: async (payload: any) => {
        // Send the agent's reply back to NoChat
        const replyText = payload.text || "";
        if (!replyText.trim()) return;

        const conversationId = msg.conversation_id;
        if (!conversationId) {
          console.error("[NoChat] No conversation_id on inbound message — cannot reply");
          return;
        }

        const result = await client.sendMessage(conversationId, replyText);
        if (result.ok) {
          console.log(`[NoChat] Replied to ${senderName} in ${conversationId.slice(0, 8)}`);
        } else {
          console.error(`[NoChat] Reply failed: ${result.error}`);
        }
      },
      onError: (err: unknown, info: { kind: string }) => {
        console.error(`[NoChat] Dispatch error (${info.kind}): ${err}`);
      },
    },
  });
}

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
