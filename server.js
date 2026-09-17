import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const bookings = [];

const gates = {
  "garage-1": { shouldOpen: false, lastPlate: null }
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

function normalizePlate(plate) {
  return String(plate || "").trim().toUpperCase().replace(/\s+/g, "");
}

function findActiveBooking(plate) {
  const target = normalizePlate(plate);
  const now = Date.now();
  return bookings.find(
    b => b.plate === target && new Date(b.expiresAt).getTime() > now
  );
}

app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

app.post("/api/bookings", (req, res) => {
  const { name, plate, days } = req.body;
  const plateNorm = normalizePlate(plate);
  const dayCount = parseInt(days, 10);

  if (!name || !plateNorm || !dayCount || dayCount < 1) {
    return res.status(400).json({ error: "name, plate and days are required" });
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + dayCount);

  const booking = { name, plate: plateNorm, startedAt, expiresAt };
  bookings.push(booking);

  res.status(201).json(booking);
});

app.post("/api/authorize", (req, res) => {
  const { plate, gateId } = req.body;
  const id = gateId || "garage-1";
  const booking = findActiveBooking(plate);

  if (!gates[id]) {
    return res.status(404).json({ error: "unknown gate" });
  }

  if (!booking) {
    return res.status(403).json({ authorized: false, reason: "no active pass for that plate" });
  }

  gates[id].shouldOpen = true;
  gates[id].lastPlate = booking.plate;

  res.json({ authorized: true, name: booking.name, expiresAt: booking.expiresAt });
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
