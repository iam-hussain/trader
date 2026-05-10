import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "@trader/db";

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const body = Credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (existing) return reply.code(409).send({ error: "email_in_use" });

    const passwordHash = await argon2.hash(body.data.password);
    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        passwordHash,
        settings: { create: {} },
      },
    });

    const token = app.jwt.sign({ sub: user.id });
    reply.setCookie("trader_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { id: user.id, email: user.email };
  });

  app.post("/login", async (req, reply) => {
    const body = Credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user) return reply.code(401).send({ error: "invalid_credentials" });

    const ok = await argon2.verify(user.passwordHash, body.data.password);
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

    const token = app.jwt.sign({ sub: user.id });
    reply.setCookie("trader_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { id: user.id, email: user.email };
  });

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie("trader_token", { path: "/" });
    return { ok: true };
  });

  app.get("/me", { preHandler: [app.requireAuth] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    return user;
  });
}
