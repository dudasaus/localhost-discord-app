import type { Context, Hono } from "@hono/hono";
import type { CommandInterface } from "./command.ts";
import { envOrThrow } from "@dudasaus/env-or-throw";
import {
  type APIApplicationCommandInteraction,
  InteractionResponseType,
  InteractionType,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export class DiscordHono {
  private handlersRegistered = false;
  private readonly commands = new Map<string, CommandInterface>();
  private discordPublicKey: string;
  private discordAppId: string;
  private discordApiUrl: string;
  private discordBotToken: string;
  private discordChannelId: string;
  constructor(
    readonly app: Hono,
  ) {
    this.discordPublicKey = envOrThrow("DISCORD_PUBLIC_KEY");
    this.discordAppId = envOrThrow("DISCORD_APP_ID");
    this.discordApiUrl = Deno.env.get("DISCORD_API_URL") ??
      "https://discord.com/api/v10";
    this.discordBotToken = envOrThrow("DISCORD_BOT_TOKEN");
    this.discordChannelId = envOrThrow("DISCORD_CHANNEL_ID");
  }

  /**
   * Register a slash command handler.
   */
  command(command: CommandInterface): this {
    if (this.handlersRegistered) {
      throw new Error("Handlers already registered.");
    }
    this.commands.set(command.name, command);
    return this;
  }

  private handleCommand(
    c: Context,
    body: APIApplicationCommandInteraction,
  ) {
    const commandName = body.data.name;

    const foundCommand = this.commands.get(commandName);

    if (!foundCommand) {
      return c.body("Command not found", 404);
    }

    const handlerResult = foundCommand.handler();
    if (typeof handlerResult === "string") {
      return c.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: handlerResult,
        },
      });
    }

    // Start the late update.
    const lateUpdate = async () => {
      const content = await handlerResult;
      const baseUrl = this.discordApiUrl;
      const updateRequest = new Request(
        `${baseUrl}/webhooks/${this.discordAppId}/${body.token}/messages/@original`,
        {
          method: "PATCH",
          body: JSON.stringify({ content }),
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      const retryTimers = [1, 5, 10];
      for (const attempt of [...retryTimers, 0]) {
        const res = await fetch(updateRequest);
        if (res.ok) {
          break;
        }
        if (attempt > 0) {
          await wait(attempt * 1000);
        }
      }
    };
    c.executionCtx.waitUntil(lateUpdate());

    return c.json({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
    });
  }

  private pong(c: Context) {
    return c.json({
      type: InteractionResponseType.Pong,
    });
  }

  /**
   * Starts listening for hono requests.
   */
  listen() {
    this.handlersRegistered = true;
    this.app.post("/interactions", async (c) => {
      const rawBody = await c.req.text();

      // Verify.
      const signature = c.req.header("x-signature-ed25519");
      if (!signature) {
        console.error("Missing signature");
        return c.body("Signature not found", 401);
      }
      const timestamp = c.req.header("x-signature-timestamp");
      if (!timestamp) {
        console.error("Missing timestamp");
        return c.body("Timestamp not found", 401);
      }
      const publicKey = this.discordPublicKey;
      const verified = await verifyKey(
        rawBody,
        signature,
        timestamp,
        publicKey,
      );
      if (
        !verified
      ) {
        console.error("Failed to verify", {
          publicKey,
          signature,
          timestamp,
          rawBody,
        });
        return c.body("Unable to verify", 401);
      }

      const body = JSON.parse(rawBody);
      const { type } = body;

      switch (type) {
        case InteractionType.Ping:
          return this.pong(c);
        case InteractionType.ApplicationCommand:
          return this.handleCommand(c, body);
        default:
          return;
      }
    });
  }

  /**
   * Send a message via Discord bot.
   */
  async message(content: string, channelId?: string) {
    channelId = channelId ?? this.discordChannelId;
    const response = await fetch(
      `${this.discordApiUrl}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bot ${this.discordBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      },
    );
    return await response.text();
  }

  /**
   * Register the commands with Discord.
   * @returns success
   */
  async registerCommands(): Promise<boolean> {
    let allOk = true;
    for (const command of this.commands.values()) {
      const response = await fetch(
        `https://discord.com/api/v10/applications/${
          Deno.env.get("DISCORD_APP_ID")
        }/commands`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bot ${this.discordBotToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: command.name,
            description: command.description,
          }),
        },
      );

      if (response.ok) {
        console.log(`${command.name}: %cregistered`, "color: lime");
      } else {
        allOk = false;
        console.error(`${command.name}: %cFailed to register`, "color: red");
        console.error(await response.json());
      }
    }
    return allOk;
  }
}
