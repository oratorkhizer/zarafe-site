import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOW = ["https://zarafehospitality.com", "https://www.zarafehospitality.com", "http://localhost:8765"];
function cors(origin: string | null) {
  const ok = origin && (ALLOW.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOW[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
  };
}
const TYPES = ["CME programme", "Medical conference", "Pharma or device company meeting", "Health expo or screening camp", "Hospital or institution function", "Other"];
const MEALS = ["Breakfast", "Lunch", "Tea break", "High tea", "Dinner"];
const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// ---- Bot checks (Caspian Studio form-protection standard) ----
// TURNSTILE_SECRET_KEY (function secret): while unset, Turnstile is skipped.
const HUMAN_CHECK_FAILED =
  "We could not confirm this was sent by a person. Please refresh the page and try again.";

function looksRandom(name: string, email: string) {
  const n = (name || "").trim();
  if (/^[A-Za-z]{10,}$/.test(n) && (n.slice(1).match(/[A-Z]/g) || []).length >= 3) return true;
  const m = (email || "").trim().toLowerCase().match(/^([^@]+)@(gmail|googlemail)\.com$/);
  return !!m && (m[1].match(/\./g) || []).length >= 3;
}

function tooFast(ms: unknown) {
  if (ms === undefined || ms === null || ms === "") return false;
  const n = Number(ms);
  return Number.isFinite(n) && n < 1500;
}

async function turnstileOk(token: unknown, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") form.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(3000),
    });
    const d = await r.json();
    return d?.success === true;
  } catch {
    return true; // fail open if Cloudflare is unreachable
  }
}
// ---- end bot checks ----

async function sha(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: h });
  let b: any = {};
  try { b = await req.json(); } catch { b = {}; }
  // Honeypot, too fast, random-string name: pretend success, store nothing.
  if (s(b.website, 50)) return new Response(JSON.stringify({ ok: true }), { headers: h });
  if (tooFast(b.ms)) return new Response(JSON.stringify({ ok: true }), { headers: h });

  const name = s(b.name, 120), organisation = s(b.organisation, 160), email = s(b.email, 160), venue = s(b.venue, 200), message = s(b.message, 1000);
  if (looksRandom(name, email)) return new Response(JSON.stringify({ ok: true }), { headers: h });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!(await turnstileOk(b.turnstile, ip))) {
    return new Response(JSON.stringify({ error: HUMAN_CHECK_FAILED, code: "human_check" }), { status: 400, headers: h });
  }

  const phoneDigits = s(b.phone, 30).replace(/\D/g, "");
  const event_type = TYPES.includes(b.event_type) ? b.event_type : "";
  const guests = parseInt(b.guests, 10);
  const event_date = /^\d{4}-\d{2}-\d{2}$/.test(s(b.event_date, 10)) ? b.event_date : null;
  const meals = Array.isArray(b.meals) ? b.meals.filter((m: string) => MEALS.includes(m)) : [];
  const budget_band = s(b.budget_band, 40);
  if (!name || !organisation || !event_type || !event_date || !(guests >= 10 && guests <= 10000) || phoneDigits.length < 10 || phoneDigits.length > 13)
    return new Response(JSON.stringify({ error: "Missing or invalid fields" }), { status: 400, headers: h });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: h });

  const phone = phoneDigits.length === 10 ? "+91" + phoneDigits : "+" + phoneDigits;
  const ip_hash = await sha(ip + "zarafe");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db.from("enquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since);
  if ((count || 0) >= 5) return new Response(JSON.stringify({ error: "Too many enquiries. Please WhatsApp us." }), { status: 429, headers: h });

  const row = { name, organisation, phone, email: email || null, event_type, event_date, guests, venue: venue || null, meals, budget_band: budget_band || null, message: message || null, source_path: s(b.source_path, 200) || null, utm: b.utm && typeof b.utm === "object" ? b.utm : {}, ip_hash };
  const { data, error } = await db.from("enquiries").insert(row).select("id").single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: h });

  const hook = Deno.env.get("NOTIFY_WEBHOOK");
  if (hook) {
    const text = `New Zarafé enquiry\n${name}, ${organisation}\n${phone}${email ? " · " + email : ""}\n${event_type} · ${event_date} · ${guests} guests${venue ? " · " + venue : ""}\nMeals: ${meals.join(", ") || "not stated"}${budget_band ? "\nBudget: " + budget_band : ""}${message ? "\n" + message : ""}\nDesk: https://zarafehospitality.com/admin`;
    fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, enquiry: row, id: data.id }) }).catch(() => {});
  }
  return new Response(JSON.stringify({ ok: true, id: data.id }), { headers: h });
});
