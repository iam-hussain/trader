"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { Topbar } from "@/components/Topbar";

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
    <>
      <Topbar crumbs={["Markets", "Watchlist"]} />
      <div className="page max-w-[900px]">
        <div className="b-card p-3 flex gap-2 items-center">
          <Star className="w-3.5 h-3.5 t-dim" />
          <input
            className="input flex-1"
            placeholder="New watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
          />
          <button className="btn btn-primary" onClick={createList}>
            <Plus className="w-3.5 h-3.5" /> Create
          </button>
        </div>

        {isLoading && <div className="text-fg-muted text-[12px]">Loading…</div>}

        <div className="flex flex-col gap-3">
          {data?.map((wl) => (
            <section key={wl.id} className="b-card">
              <div className="flex items-center px-3.5 py-2.5 hairline-b">
                <div className="font-semibold text-[13px]">{wl.name}</div>
                <span className="chip ml-2">{wl.tickers.length}</span>
                <button
                  className="btn btn-ghost btn-sm ml-auto"
                  onClick={() => removeList(wl.id)}
                  aria-label="Delete watchlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 flex flex-wrap gap-1.5">
                {wl.tickers.map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <Link href={`/ticker/${t}`} className="chip chip-solid mono no-underline">
                      {t}
                    </Link>
                    <button
                      onClick={() => removeTicker(wl.id, t)}
                      className="t-dim hover:t-neg text-[12px] px-1"
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="p-3 hairline-t flex gap-2">
                <input
                  className="input flex-1 mono"
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
    </>
  );
}
