import { buildServer } from "./app.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const { app } = await buildServer(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

