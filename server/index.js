import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
const upload = multer();

// GitHub config
const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_USER;
const repo = process.env.GITHUB_REPO;
const folder = process.env.GITHUB_FOLDER;

const githubBase = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;

// Helper fetch function
async function ghRequest(url, options = {}) {
  options.headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    ...options.headers,
  };
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error);
  }
  return res.json();
}

app.get("/", (req, res) => {
    res.send("HASH API is running");
});

// ---------------------- UPLOAD ----------------------
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const content = req.file.buffer.toString("base64");

    await ghRequest(`${githubBase}/${fileName}`, {
      method: "PUT",
      body: JSON.stringify({
        message: "Upload new image",
        content,
      }),
    });

    res.json({
      message: "Image uploaded successfully",
      file_name: fileName,
      cdn_url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- LIST ----------------------
app.get("/images", async (req, res) => {
  try {
    const data = await ghRequest(githubBase);
    const images = data.map((file) => ({
      name: file.name,
      cdn_url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${file.name}`,
    }));
    res.json({ total: images.length, images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- UPDATE ----------------------
app.put("/update/:fileName", upload.single("image"), async (req, res) => {
  try {
    const fileName = req.params.fileName;
    if (!req.file) return res.status(400).json({ error: "No image provided" });

    // Get SHA of old file
    const fileInfo = await ghRequest(`${githubBase}/${fileName}`);
    const sha = fileInfo.sha;

    // Delete old file
    await ghRequest(`${githubBase}/${fileName}`, {
      method: "DELETE",
      body: JSON.stringify({ message: `Delete ${fileName}`, sha }),
    });

    // Upload new image
    const newContent = req.file.buffer.toString("base64");
    await ghRequest(`${githubBase}/${fileName}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Update ${fileName}`, content: newContent }),
    });

    res.json({
      message: "Image updated successfully",
      file_name: fileName,
      cdn_url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}/${folder}/${fileName}?v=${Date.now()}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- DELETE ----------------------
app.delete("/delete/:fileName", async (req, res) => {
  try {
    const fileName = req.params.fileName;

    const fileInfo = await ghRequest(`${githubBase}/${fileName}`);
    const sha = fileInfo.sha;

    await ghRequest(`${githubBase}/${fileName}`, {
      method: "DELETE",
      body: JSON.stringify({ message: `Delete ${fileName}`, sha }),
    });

    res.json({ message: "Image deleted", file: fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------- LOCAL TEST SERVER ----------------------
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
