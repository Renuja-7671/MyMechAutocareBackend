// src/app.js
require("dotenv").config(); // safe to call — tests will override with .env.test if configured
const express = require("express");
const cors = require("cors");
const routes = require("./routes"); // your existing centralized routes

const app = express();

// CORS (same as your server file)
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health + root endpoints (copy your existing handlers)
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to MyMech AutoCare API Server",
    version: "1.0.0",
    documentation: "/api",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    message: "Server is running",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount your routes
app.use("/api", routes);

// 404 handler
app.use((req, res) => {
  res
    .status(404)
    .json({ success: false, error: "Route not found", path: req.originalUrl });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Something went wrong!",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

module.exports = app;
