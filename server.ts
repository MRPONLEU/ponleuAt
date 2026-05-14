import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import FormData from "form-data";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // Telegram Proxy API
  app.post("/api/telegram/send", async (req, res) => {
    const { token, chat_id, text, parse_mode } = req.body;

    // Mask token for logging
    const maskedToken = token ? `${token.substring(0, 5)}...${token.slice(-5)}` : 'missing';
    console.log(`Sending Telegram message to ${chat_id} using token ${maskedToken}`);
    console.log(`Message Length: ${text?.length || 0}`);

    if (!token || !chat_id || !text) {
      return res.status(400).json({ ok: false, description: "Missing required fields" });
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await axios.post(url, {
        chat_id,
        text,
        parse_mode: parse_mode || "HTML"
      }, {
        timeout: 10000 // 10 seconds timeout
      });

      console.log(`Telegram Success for ${chat_id}`);
      res.status(200).json(response.data);
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = error.message;
      
      console.error("Telegram Proxy Error Detail:", JSON.stringify(errorData || errorMessage, null, 2));
      
      if (error.response) {
        // Return exactly what Telegram returned
        res.status(error.response.status).json(errorData);
      } else {
        res.status(500).json({ ok: false, description: errorMessage || "Internal Server Error" });
      }
    }
  });

  app.post("/api/telegram/sendPhoto", async (req, res) => {
    const { token, chat_id, photo, caption, parse_mode } = req.body;
    if (!token || !chat_id || !photo) {
      return res.status(400).json({ ok: false, description: "Missing required fields" });
    }
    try {
      // Remove data URL prefix if present
      const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const form = new FormData();
      form.append('chat_id', chat_id);
      form.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
      form.append('caption', caption || '');
      form.append('parse_mode', parse_mode || 'HTML');

      const response = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
        headers: form.getHeaders(),
        timeout: 20000
      });

      res.status(200).json(response.data);
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error("Telegram sendPhoto error:", errorData || error.message);
      res.status(error.response?.status || 500).json(errorData || { ok: false, description: error.message });
    }
  });

  app.post("/api/telegram/delete", async (req, res) => {
    const { token, chat_id, message_id } = req.body;

    if (!token || !chat_id || !message_id) {
      return res.status(400).json({ ok: false, description: "Missing required fields" });
    }

    try {
      const url = `https://api.telegram.org/bot${token}/deleteMessage`;
      const response = await axios.post(url, {
        chat_id,
        message_id
      }, {
        timeout: 10000
      });

      res.status(200).json(response.data);
    } catch (error: any) {
      const errorData = error.response?.data;
      res.status(error.response?.status || 500).json(errorData || { ok: false, description: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
