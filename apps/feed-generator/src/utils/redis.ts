import { Redis } from "ioredis";
import { config } from "../config.ts";

const redis = new Redis(config.redisUrl);

export { redis };
