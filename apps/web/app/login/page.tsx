"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="card p-6 w-80 space-y-3">
        <h1 className="text-xl font-semibold">Trader Daily</h1>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={mode === "login" ? "underline" : "text-fg-muted"}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "underline" : "text-fg-muted"}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
        <input
          className="input w-full"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input w-full"
          type="password"
          placeholder="password (min 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="text-neg text-xs">{err}</div>}
        <button type="submit" className="btn btn-primary w-full justify-center">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
