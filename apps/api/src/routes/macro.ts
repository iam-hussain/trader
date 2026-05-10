import type { FastifyInstance } from "fastify";
import { quantGet } from "../services/quant.js";

export async function macroRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/regime", async () => quantGet("/macro/regime"));
}
