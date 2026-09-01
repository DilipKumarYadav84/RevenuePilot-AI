import type { Server } from "node:http";

import mongoose from "mongoose";

import app from "./app";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";

let server: Server | undefined;

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    server = app.listen(env.PORT, () => {
      console.log(`RevenuePilot API running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("RevenuePilot API failed to start");
    console.error(error);
    process.exit(1);
  }
};

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`${signal} received. Shutting down RevenuePilot API...`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await mongoose.connection.close();
    console.log("RevenuePilot API shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("RevenuePilot API shutdown failed");
    console.error(error);
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer();
