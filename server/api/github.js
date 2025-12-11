import express from "express";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import serverless from "serverless-http";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Multer config
const upload = multer();

// GitHub config
const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_USER;
const repo = process.env.GITHUB_REPO;
const folder = process.env.GITHUB_FOLDER;

const githubBase = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;

// ---------------------- UPLOAD ----------------------
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const base64 = req.file.buffer.toString("base64");

    await axios.put(`${githubBase}/${fileName}`, {
      message: "Upload new image",
      content: base64,
    }, {
      headers: { Authorization: `token ${token}` }
    });

    const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}`;

    res.json({
      message: "Image uploaded successfully",
      file_name: fileName,
      cdn_url: cdnUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ---------------------- LIST ----------------------
app.get("/images", async (req, res) => {
  try {
    const result = await axios.get(githubBase, {
      headers: { Authorization: `token ${token}` },
    });

    const images = result.data.map((file) => ({
      name: file.name,
      cdn_url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${file.name}`
    }));

    res.json({ total: images.length, images });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ---------------------- UPDATE ----------------------
app.put("/update/:fileName", upload.single("image"), async (req, res) => {
  try {
    const fileName = req.params.fileName;

    if (!req.file)
      return res.status(400).json({ error: "No image provided" });

    // Get SHA
    const fileInfo = await axios.get(`${githubBase}/${fileName}`, {
      headers: { Authorization: `token ${token}` }
    });
    const sha = fileInfo.data.sha;

    // Delete old file
    await axios.delete(`${githubBase}/${fileName}`, {
      headers: { Authorization: `token ${token}` },
      data: { message: "Delete before update", sha },
    });

    const newBase64 = req.file.buffer.toString("base64");

    // Upload new updated image
    await axios.put(`${githubBase}/${fileName}`, {
      message: "Upload updated image",
      content: newBase64,
    }, {
      headers: { Authorization: `token ${token}` }
    });

    const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}?v=${Date.now()}`;

    res.json({
      message: "Image updated successfully",
      file_name: fileName,
      cdn_url: cdnUrl,
    });

  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ---------------------- DELETE ----------------------
app.delete("/delete/:fileName", async (req, res) => {
  try {
    const fileName = req.params.fileName;

    const fileInfo = await axios.get(`${githubBase}/${fileName}`, {
      headers: { Authorization: `token ${token}` }
    });

    const sha = fileInfo.data.sha;

    await axios.delete(`${githubBase}/${fileName}`, {
      headers: { Authorization: `token ${token}` },
      data: { message: `Delete ${fileName}`, sha },
    });

    res.json({ message: "Image deleted", fileName });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

export default serverless(app);
