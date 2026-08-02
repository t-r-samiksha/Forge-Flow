import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import "./db";
import agentRoutes from "./routes/agent";
import agentsRoutes from "./routes/agents";
import progressRoutes from "./routes/progress";
import mentorRoutes from "./routes/mentor";
import leaderboardRoutes from "./routes/leaderboard";
import authRoutes from "./routes/auth";
import knowledgeRoutes from "./routes/knowledge";
import toolRoutes from "./routes/tools";
import redteamRoutes from "./routes/redteam";
import crewRoutes from "./routes/crew";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ForgeFlow backend online" });
});

app.use("/api/agent", agentRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/tools", toolRoutes);
app.use("/api/redteam", redteamRoutes);
app.use("/api/crew", crewRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✓ ForgeFlow backend running on port ${PORT}`);
});
