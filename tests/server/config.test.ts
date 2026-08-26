import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../../src/server/config.js";

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://vocabulary.example",
  SESSION_SECRET: "a-production-secret-with-32-characters",
  TELEGRAM_BOT_ID: "123456",
  TELEGRAM_BOT_TOKEN: "123456:token",
  TELEGRAM_CLIENT_SECRET: "telegram-client-secret",
};

describe("server configuration", () => {
  it("loads development defaults and normalizes the application origin", () => {
    expect(loadServerConfig({})).toMatchObject({
      environment: "development",
      host: "127.0.0.1",
      port: 3000,
      appOrigin: "http://127.0.0.1:5173",
    });
    expect(loadServerConfig({ APP_ORIGIN: "https://vocabulary.example/" }).appOrigin)
      .toBe("https://vocabulary.example");
  });

  it.each(["0", "65536", "3000abc", "not-a-port"])(
    "rejects an invalid port: %s",
    (port) => {
      expect(() => loadServerConfig({ PORT: port })).toThrow(
        "PORT must be an integer between 1 and 65535",
      );
    },
  );

  it.each([
    "https://",
    "ftp://vocabulary.example",
    "https://vocabulary.example/app",
    "https://user:password@vocabulary.example",
  ])("rejects a value that is not an origin: %s", (appOrigin) => {
    expect(() => loadServerConfig({ APP_ORIGIN: appOrigin })).toThrow(
      "APP_ORIGIN must be a valid HTTP or HTTPS origin",
    );
  });

  it("requires HTTPS in production", () => {
    expect(() => loadServerConfig({
      ...productionEnvironment,
      APP_ORIGIN: "http://vocabulary.example",
    })).toThrow("APP_ORIGIN must use HTTPS in production");
    expect(loadServerConfig(productionEnvironment).appOrigin).toBe("https://vocabulary.example");
  });

  it("rejects an unsupported environment", () => {
    expect(() => loadServerConfig({ NODE_ENV: "staging" })).toThrow(
      "Unsupported NODE_ENV: staging",
    );
  });
});
