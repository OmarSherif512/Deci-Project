import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const gates = {
  "garage-1": { shouldOpen: false, lastPlate: null }
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true, databaseConfigured: Boolean(supabase) });
});

function normalizePlate(plate) {
  return String(plate || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function findActiveBooking(plate) {
  const target = normalizePlate(plate);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select("name, plate, started_at, expires_at")
    .eq("plate", target)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

app.get("/api/bookings", async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "database is not configured" });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("name, plate, started_at, expires_at")
    .order("started_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/bookings", async (req, res) => {
  const { name, plate, days } = req.body;
  const plateNorm = normalizePlate(plate);
  const dayCount = parseInt(days, 10);

  if (!name || !plateNorm || !dayCount || dayCount < 1) {
    return res.status(400).json({ error: "name, plate and days are required" });
  }

  if (!supabase) {
    return res.status(503).json({ error: "database is not configured" });
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + dayCount);

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      name: String(name).trim(),
      plate: plateNorm,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    })
    .select("name, plate, started_at, expires_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    name: data.name,
    plate: data.plate,
    startedAt: data.started_at,
    expiresAt: data.expires_at
  });
});

app.post("/api/authorize", async (req, res) => {
  const { plate, gateId } = req.body;
  const id = gateId || "garage-1";

  if (!gates[id]) {
    return res.status(404).json({ error: "unknown gate" });
  }

  let booking;
  try {
    booking = await findActiveBooking(plate);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!booking) {
    return res.status(403).json({ authorized: false, reason: "no active pass for that plate" });
  }

  gates[id].shouldOpen = true;
  gates[id].lastPlate = booking.plate;

  res.json({ authorized: true, name: booking.name, expiresAt: booking.expires_at });
});

app.get("/api/gate-status", (req, res) => {
  const id = req.query.gateId || "garage-1";
  const gate = gates[id];

  if (!gate) {
    return res.status(404).json({ error: "unknown gate" });
  }

  const shouldOpen = gate.shouldOpen;
  gate.shouldOpen = false;

  res.json({ open: shouldOpen });
});

const PORT = process.env.PORT || 3000;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`ParkWell backend running on port ${PORT}`);
  });
}

export default app;
