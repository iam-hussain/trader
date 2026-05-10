import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  MONGO_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  QUANT_PUBLIC_URL: z.string().url().default("http://localhost:8000"),
  NEXTAUTH_SECRET: z.string().min(16),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().default("http://localhost:11434"),
  DEFAULT_LLM_PROVIDER: z
    .enum(["anthropic", "openai", "google", "ollama"])
    .default("anthropic"),

  IBKR_HOST: z.string().default("127.0.0.1"),
  IBKR_PORT: z.coerce.number().default(7497),
  IBKR_CLIENT_ID: z.coerce.number().default(42),
  IBKR_MODE: z.enum(["paper", "live"]).default("paper"),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
