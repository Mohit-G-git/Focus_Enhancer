import "dotenv/config";
import express from "express";
import connectDB from "./config/db.js";
import taskRoutes from "./modules/tasks/task.routes.js";
import voteRoutes from "./modules/voting/vote.routes.js";
import member3TestRoutes from "./modules/testing/member3.test.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/tasks", taskRoutes);
app.use("/votes", voteRoutes);

// Member 3 — Temporary validation route (remove after testing)
app.use("/member3-test", member3TestRoutes);

// Health check
app.get("/", (req, res) => {
    res.json({ success: true, message: "Focus Enhancer API is running." });
});

// Error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
});

const PORT = process.env.PORT || 5000;

// Start server first, then connect to MongoDB
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    connectDB().catch((error) => {
        console.error("MongoDB connection failed:", error.message);
        console.error("Server is running but database is unavailable.");
    });
});
