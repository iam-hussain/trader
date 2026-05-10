import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate(
    "requireAuth",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const decoded = await req.jwtVerify<{ sub: string }>();
        req.userId = decoded.sub;
      } catch {
        reply.code(401).send({ error: "unauthorized" });
      }
    }
  );
});
