import mongoose from "mongoose";

import { env } from "./env";

const redactMongoUri = (uri: string): string => {
  try {
    const parsed = new URL(uri);
    parsed.username = parsed.username ? "[redacted]" : "";
    parsed.password = parsed.password ? "[redacted]" : "";
    return parsed.toString();
  } catch {
    return "configured MongoDB URI";
  }
};

export const connectDatabase = async (): Promise<typeof mongoose> => {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI);
    const { host, name } = connection.connection;

    console.log(
      `MongoDB connected: ${host}${name ? `/${name}` : ""} (${redactMongoUri(env.MONGODB_URI)})`,
    );

    return connection;
  } catch (error) {
    console.error("MongoDB initial connection failed");
    throw error;
  }
};
