import React, { useState, useRef } from "react";
import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";

import "filepond/dist/filepond.min.css";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

import { API } from "./Api"; // your API base e.g. export const API = "http://localhost:3000";
import "./App.css";

registerPlugin(FilePondPluginImagePreview, FilePondPluginFileValidateType);

export default function App() {
  const [files, setFiles] = useState([]); // FilePond file items
  const [isUploading, setIsUploading] = useState(false);
  const [serverResponse, setServerResponse] = useState(null);
  const [urls, setUrls] = useState([]); // array of { url, label, copied }
  const [error, setError] = useState("");
  const copyTimers = useRef({}); // store timers to clear "Copied" state

  const selectedFile = files?.[0]?.file || null;

  const resetAll = () => {
    setFiles([]);
    setServerResponse(null);
    setUrls([]);
    setError("");
  };

  const parseUrlsFromResponse = (data) => {
    // returns array of { url, label }
    const found = [];

    if (!data) return found;

    // Common fields
    const candidates = [
      { key: "cdn_url", label: "CDN URL" },
      { key: "raw_url", label: "Raw URL" },
      { key: "download_url", label: "Download URL" },
      { key: "url", label: "URL" },
      { key: "file_url", label: "File URL" },
      { key: "file", label: "File" },
      { key: "content", label: "Content" },
    ];

    // Collect any known keys that are strings and look like URLs
    candidates.forEach((c) => {
      if (data[c.key] && typeof data[c.key] === "string" && isProbablyUrl(data[c.key])) {
        found.push({ url: data[c.key], label: c.label });
      }
    });

    // If server returns `files` or `files[]` array
    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        if (typeof item === "string" && isProbablyUrl(item)) {
          found.push({ url: item, label: `File ${idx + 1}` });
        } else if (item?.cdn_url && isProbablyUrl(item.cdn_url)) {
          found.push({ url: item.cdn_url, label: `CDN ${idx + 1}` });
        }
      });
    }

    if (Array.isArray(data.files)) {
      data.files.forEach((f, i) => {
        if (typeof f === "string" && isProbablyUrl(f)) found.push({ url: f, label: `File ${i+1}` });
        if (f?.cdn_url) found.push({ url: f.cdn_url, label: `CDN ${i+1}` });
      });
    }

    // Search recursively for any string that looks like URL
    const recurse = (obj, path = "") => {
      if (!obj || typeof obj === "string") {
        if (typeof obj === "string" && isProbablyUrl(obj)) {
          found.push({ url: obj, label: path || "URL" });
        }
        return;
      }
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => recurse(v, `${path}[${i}]`));
      } else if (typeof obj === "object") {
        Object.keys(obj).forEach((k) => recurse(obj[k], path ? `${path}.${k}` : k));
      }
    };
    recurse(data);

    // Deduplicate and keep order
    const dedup = [];
    const seen = new Set();
    found.forEach((f) => {
      if (!seen.has(f.url)) {
        dedup.push(f);
        seen.add(f.url);
      }
    });

    // If nothing found but response has strings, stringify full response as fallback
    if (dedup.length === 0 && (typeof data === "string" || typeof data === "number")) {
      const text = String(data);
      if (isProbablyUrl(text)) dedup.push({ url: text, label: "Response" });
    }

    return dedup;
  };

  function isProbablyUrl(s) {
    if (typeof s !== "string") return false;
    return /^(https?:\/\/|\/\/)/i.test(s);
  }

  const uploadToServer = async () => {
    setError("");
    setServerResponse(null);
    setUrls([]);
    if (!selectedFile) {
      setError("Please select an image to upload.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const res = await fetch(`${API}/upload`, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
        try {
          data = JSON.parse(data);
        } catch (e) {
          // keep raw text
        }
      }

      setServerResponse(data);

      // Build url list from response
      const parsed = parseUrlsFromResponse(data);

      // If the API returned a common single url (cdn_url) as string at root
      if (parsed.length === 0 && data && typeof data === "object") {
        // Try common single-field fallback
        const fallbackCandidates = ["cdn_url", "url", "raw_url", "download_url"];
        for (const k of fallbackCandidates) {
          if (data[k] && isProbablyUrl(data[k])) {
            parsed.push({ url: data[k], label: k });
          }
        }
      }

      // If still empty, show message
      if (parsed.length === 0) {
        // try to stringify the result as an info row
        setUrls([{ url: "", label: "Server Response (no URLs found)" }]);
      } else {
        setUrls(parsed.map((u) => ({ ...u, copied: false })));
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setError((err && err.message) || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopy = (index) => {
    const item = urls[index];
    if (!item || !item.url) return;
    navigator.clipboard.writeText(item.url).then(() => {
      setUrls((prev) =>
        prev.map((u, i) => (i === index ? { ...u, copied: true } : u))
      );
      // Clear copied flag after short time
      if (copyTimers.current[index]) clearTimeout(copyTimers.current[index]);
      copyTimers.current[index] = setTimeout(() => {
        setUrls((prev) => prev.map((u, i) => (i === index ? { ...u, copied: false } : u)));
        delete copyTimers.current[index];
      }, 1600);
    });
  };

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="brand">
          <strong>Buket</strong>
          <span className="muted"> Develop & Manage By Heet Dhameliya</span>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <h1 className="panel-title">Upload an image</h1>
          <p className="panel-sub">
            Drag & drop or click to select. FilePond gives a great mobile-friendly file picker and preview.
          </p>

          <div className="uploader">
            <FilePond
              files={files}
              onupdatefiles={setFiles}
              allowMultiple={false}
              acceptedFileTypes={["image/*"]}
              labelIdle='Drag & Drop your image or <span class="filepond--label-action">Browse</span>'
              imagePreviewHeight={160}
              maxFileSize="10MB"
              allowFileTypeValidation={true}
              credits={false}
            />
          </div>

          <div className="actions">
            <button
              className="btn primary"
              onClick={uploadToServer}
              disabled={isUploading || !selectedFile}
              aria-disabled={isUploading || !selectedFile}
            >
              {isUploading ? "Uploading…" : "Upload Image"}
            </button>

            <button
              className="btn secondary"
              onClick={resetAll}
              disabled={isUploading && true}
            >
              Reset
            </button>
          </div>

          {error && <div className="alert error">{error}</div>}
        </section>

        <section className="panel result">
          <h2 className="panel-title">Upload result</h2>

          <div className="result-grid">
            <div className="result-preview">
              {selectedFile ? (
                <div className="thumb-wrap">
                  <img
                    alt="preview"
                    src={selectedFile ? URL.createObjectURL(selectedFile) : ""}
                    className="thumb"
                  />
                  <div className="thumb-meta">
                    <div className="meta-name">{selectedFile.name}</div>
                    <div className="meta-size">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
              ) : (
                <div className="placeholder">No file selected</div>
              )}
            </div>

            <div className="result-urls">
              <div className="urls-title">Returned URLs</div>

              {urls.length === 0 && <div className="muted">No upload yet. URLs will appear here.</div>}

              <ul className="url-list">
                {urls.map((u, i) => (
                  <li key={i} className="url-item">
                    <div className="url-info">
                      <div className="url-label">{u.label || `URL ${i + 1}`}</div>
                      <input className="url-input" readOnly value={u.url} placeholder={u.url ? "" : "—"} />
                    </div>
                    <div className="url-actions">
                      <button
                        className={`btn small ${u.copied ? "success" : "ghost"}`}
                        onClick={() => handleCopy(i)}
                        disabled={!u.url}
                        aria-label={`Copy ${u.label || "URL"}`}
                      >
                        {u.copied ? "Copied" : "Copy"}
                      </button>
                      {u.url && (
                        <a className="btn small link" href={u.url} target="_blank" rel="noreferrer">Open</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="server-raw">
            <div className="urls-title">Server response</div>
            <pre className="raw-box">{serverResponse ? JSON.stringify(serverResponse, null, 2) : "Server response will appear here."}</pre>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>Buket Develop & Manage By Heet Dhameliya</div>
      </footer>
    </div>
  );
}
