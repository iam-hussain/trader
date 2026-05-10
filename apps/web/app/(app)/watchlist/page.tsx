"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";

interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
}

export default function WatchlistPage() {
  const { data, mutate, isLoading } = useSWR<Watchlist[]>("/api/watchlist", fetcher);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState<Record<string, string>>({});

  async function createList() {
    if (!newName.trim()) return;
    await api("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), tickers: [] }),
    });
    setNewName("");
    void mutate();
  }

  async function addTicker(id: string) {
    const t = (adding[id] ?? "").trim().toUpperCase();
    if (!t) return;
    await api(`/api/watchlist/${id}/add`, { method: "POST", body: JSON.stringify({ ticker: t }) });
    setAdding({ ...adding, [id]: "" });
    void mutate();
  }

  async function removeTicker(id: string, ticker: string) {
    await api(`/api/watchlist/${id}/remove`, { method: "POST", body: JSON.stringify({ ticker }) });
    void mutate();
  }

  async function removeList(id: string) {
    await api(`/api/watchlist/${id}`, { method: "DELETE" });
    void mutate();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Watchlists</h1>
      </header>

      <section className="card p-4 flex gap-2">
        <input
          className="input flex-1"
          placeholder="New watchlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn-primary" onClick={createList}>
          <Plus size={14} /> Create
        </button>
      </section>

      {isLoading && <div className="text-fg-muted">Loading…</div>}

      <div className="space-y-3">
        {data?.map((wl) => (
          <section key={wl.id} className="card p-4">
            <header className="flex items-center justify-between mb-2">
              <h2 className="font-medium">{wl.name}</h2>
              <button
                className="btn text-fg-muted hover:text-neg"
                onClick={() => removeList(wl.id)}
                aria-label="Delete watchlist"
              >
                <Trash2 size={14} />
              </button>
            </header>
            <ul className="flex flex-wrap gap-2 mb-3">
              {wl.tickers.map((t) => (
                <li key={t} className="flex items-center gap-1">
                  <Link
                    href={`/ticker/${t}`}
                    className="mono px-2 py-0.5 rounded bg-bg-elevated border border-border text-sm hover:border-accent"
                  >
                    {t}
                  </Link>
                  <button
                    onClick={() => removeTicker(wl.id, t)}
                    className="text-fg-subtle hover:text-neg"
                    aria-label={`Remove ${t}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Add ticker (e.g. AAPL)"
                value={adding[wl.id] ?? ""}
                onChange={(e) => setAdding({ ...adding, [wl.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addTicker(wl.id)}
              />
              <button className="btn" onClick={() => addTicker(wl.id)}>
                Add
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
