"use client";

type Variant = "info" | "error" | "success";

const STYLE: Record<Variant, string> = {
  info: "background:#1f2937;color:#e5e7eb;",
  error: "background:#7f1d1d;color:#fee2e2;",
  success: "background:#064e3b;color:#d1fae5;",
};

export function toast(message: string, variant: Variant = "info"): void {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute(
    "style",
    `${STYLE[variant]}position:fixed;bottom:20px;right:20px;` +
      `padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui;` +
      `box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:9999;` +
      `transition:opacity .25s ease, transform .25s ease;` +
      `opacity:0;transform:translateY(8px);max-width:360px;`
  );
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

export const notImplemented = (label: string): void =>
  toast(`${label} — not yet wired up`, "info");
