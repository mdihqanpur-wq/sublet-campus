const express = require("express");

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("SubletCampus backend is running!");
});

app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to the SubletCampus API",
    status: "success"
  });
});

app.listen(PORT, () => {
  console.log(`SubletCampus server is running at http://localhost:${PORT}`);
});