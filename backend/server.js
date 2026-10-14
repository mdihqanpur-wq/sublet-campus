require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, apikey, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.send("SubletCampus backend is running!");
});

app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to the SubletCampus API",
    status: "success"
  });
});
app.get("/api/listings", async (req, res) => {
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("status", "approved");

  if (error) {
    console.error("Supabase listings error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Could not load listings"
    });
  }

  res.json({
    status: "success",
    data: data
  });
});
app.listen(PORT, () => {
  console.log(`SubletCampus server is running at http://localhost:${PORT}`);
});