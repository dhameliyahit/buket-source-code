import express from "express";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const app = express();
app.use(express.json());
const upload = multer();
app.use(cors())
// Load GitHub config
const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_USER;
const repo = process.env.GITHUB_REPO;
const folder = process.env.GITHUB_FOLDER;

// Base GitHub API URL
const githubBase = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;

// ----------------------------------------------------------
// CREATE (UPLOAD IMAGE)
// ----------------------------------------------------------
app.post("/upload", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });

        const fileName = Date.now() + "-" + req.file.originalname;
        const content = req.file.buffer.toString("base64");

        // Upload to GitHub
        await axios.put(
            `${githubBase}/${fileName}`,
            {
                message: "Upload new image",
                content: content,
            },
            {
                headers: {
                    Authorization: `token ${token}`,
                },
            }
        );

        // JSDELIVR CDN URL
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}`;

        res.json({
            message: "Image uploaded successfully",
            file_name: fileName,
            cdn_url: cdnUrl,
        });
    } catch (ERR) {
        res.status(500).json({
            error: ERR.response?.data || ERR.message,
        });
    }
});

// ----------------------------------------------------------
// READ (LIST ALL IMAGES)
// ----------------------------------------------------------
app.get("/images", async (req, res) => {
    try {
        const list = await axios.get(githubBase, {
            headers: { Authorization: `token ${token}` },
        });

        const formatted = list.data.map((file) => ({
            name: file.name,
            cdn_url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${file.name}`,
        }));

        res.json({
            total: list.data.length,
            images: formatted
        });
    } catch (ERR) {
        res.status(500).json({
            error: ERR.response?.data || ERR.message,
        });
    }
});

// ----------------------------------------------------------
// UPDATE IMAGE (REPLACE EXISTING FILE)
// ----------------------------------------------------------
app.put("/update/:fileName", upload.single("image"), async (req, res) => {
    try {
        const fileName = req.params.fileName;

        if (!req.file) {
            return res.status(400).json({ error: "No image provided" });
        }

        // 1️⃣ Get OLD FILE SHA
        let fileInfo;
        try {
            fileInfo = await axios.get(`${githubBase}/${fileName}`, {
                headers: { Authorization: `token ${token}` },
            });
        } catch (e) {
            return res.status(404).json({ error: "File not found in GitHub repo" });
        }

        const oldSha = fileInfo.data.sha;

        // 2️⃣ DELETE OLD FILE
        await axios.delete(`${githubBase}/${fileName}`, {
            headers: { Authorization: `token ${token}` },
            data: {
                message: `Delete old image before update: ${fileName}`,
                sha: oldSha,
            },
        });

        // 3️⃣ PREPARE NEW IMAGE
        const newBase64 = req.file.buffer.toString("base64");

        // 4️⃣ UPLOAD NEW IMAGE WITH SAME FILE NAME
        await axios.put(
            `${githubBase}/${fileName}`,
            {
                message: `Upload updated image: ${fileName}`,
                content: newBase64,
            },
            {
                headers: { Authorization: `token ${token}` },
            }
        );

        // 5️⃣ JSDELIVR CACHE-BUST (VERY IMPORTANT)
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}?v=${Date.now()}`;

        res.json({
            message: "Image updated successfully",
            file_name: fileName,
            cdn_url: cdnUrl,
        });

    } catch (ERR) {
        console.log("UPDATE ERROR:", ERR?.response?.data || ERR);
        res.status(500).json({
            error: ERR.response?.data || ERR.message,
        });
    }
});

// ----------------------------------------------------------
// DELETE IMAGE
// ----------------------------------------------------------
app.delete("/delete/:fileName", async (req, res) => {
    try {
        const fileName = req.params.fileName;

        // Get file SHA
        const fileInfo = await axios.get(`${githubBase}/${fileName}`, {
            headers: { Authorization: `token ${token}` },
        });

        const sha = fileInfo.data.sha;

        // Delete file
        await axios.delete(`${githubBase}/${fileName}`, {
            headers: { Authorization: `token ${token}` },
            data: {
                message: `Delete ${fileName}`,
                sha,
            },
        });

        res.json({ message: "Image deleted", file: fileName });
    } catch (ERR) {
        res.status(500).json({
            error: ERR.response?.data || ERR.message,
        });
    }
});

// ----------------------------------------------------------
// START SERVER
// ----------------------------------------------------------
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
