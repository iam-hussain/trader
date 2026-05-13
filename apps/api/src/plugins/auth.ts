import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@trader/db";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

const DEV_USER_EMAIL = "dev@local.test";
const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META"];
let devUserIdCache: string | null = null;

async function ensureDevUser(): Promise<string> {
  if (devUserIdCache) return devUserIdCache;
  const existing = await prisma.user.findUnique({
    where: { email: DEV_USER_EMAIL },
  });
  if (existing) {
    devUserIdCache = existing.id;
    await ensureDefaultWatchlist(existing.id);
    return existing.id;
  }
  const user = await prisma.user.create({
    data: {
      email: DEV_USER_EMAIL,
      passwordHash: "dev-bypass-not-a-real-password",
      settings: { create: {} },
    },
  });
  devUserIdCache = user.id;
  await ensureDefaultWatchlist(user.id);
  return user.id;
}

async function ensureDefaultWatchlist(userId: string): Promise<void> {
  const existing = await prisma.watchlist.findFirst({ where: { userId } });
  if (existing) return;
  await prisma.watchlist.create({
    data: { userId, name: "Default", tickers: DEFAULT_WATCHLIST, position: 0 },
  });
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (env.AUTH_DISABLED) {
        req.userId = await ensureDevUser();
        return;
      }
      try {
        const decoded = await req.jwtVerify<{ sub: string }>();
        req.userId = decoded.sub;
      } catch {
        reply.code(401).send({ error: "unauthorized" });
      }
    }
  );
});
