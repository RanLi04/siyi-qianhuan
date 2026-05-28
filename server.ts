import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fs from "fs";
import Database from "better-sqlite3";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

// ... existing code in startServer ...
  const DB_FILE = path.join(process.cwd(), "sessions.db");
  const db = new Database(DB_FILE);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      clientId TEXT,
      title TEXT,
      updatedAt INTEGER,
      messages TEXT
    )
  `);

  app.get("/api/sessions", (req, res) => {
    try {
      const clientId = req.headers["x-client-id"] || "anonymous";
      const rows = db.prepare("SELECT * FROM sessions WHERE clientId = ? ORDER BY updatedAt DESC").all(clientId);
      const sessions = rows.map((row: any) => ({
        ...row,
        messages: JSON.parse(row.messages || "[]")
      }));
      res.json(sessions);
    } catch (e: any) {
      console.error("GET sessions error:", e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/sessions", (req, res) => {
    const clientId = req.headers["x-client-id"] || "anonymous";
    const { id, title, updatedAt, messages } = req.body;
    if (!id) return res.status(400).json({ error: "Missing session id" });
    
    try {
      const existingInfo = db.prepare("SELECT clientId FROM sessions WHERE id = ?").get(id) as any;
      if (existingInfo && existingInfo.clientId && existingInfo.clientId !== clientId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const stmt = db.prepare(`
        INSERT INTO sessions (id, clientId, title, updatedAt, messages)
        VALUES (@id, @clientId, @title, @updatedAt, @messages)
        ON CONFLICT(id) DO UPDATE SET 
          title = excluded.title, 
          updatedAt = excluded.updatedAt, 
          messages = excluded.messages
      `);
      
      stmt.run({
        id, 
        clientId, 
        title: title || "新会话", 
        updatedAt: updatedAt || Date.now(), 
        messages: JSON.stringify(messages || [])
      });
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("POST session error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const clientId = req.headers["x-client-id"] || "anonymous";
    const { id } = req.params;
    
    try {
      const existingInfo = db.prepare("SELECT clientId FROM sessions WHERE id = ?").get(id) as any;
      if (existingInfo) {
        if (existingInfo.clientId && existingInfo.clientId !== clientId) {
          return res.status(403).json({ error: "Forbidden" });
        }
        db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      }
      res.json({ success: true });
    } catch(err: any) {
      console.error("DELETE session error:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/title", async (req, res) => {
    try {
      const { text, modelId } = req.body;
      const modelMap: Record<string, any> = {
        "fenghechat-unlimited": { name: "huihui_ai/gemma-4-abliterated:26b", temperature: 0.6 },
        "fenghechat-pro": { name: "huihui_ai/gemma-4-abliterated:26b", temperature: 0.6 },
        "fenghechat-flash": { name: "gemma3:12b", temperature: 0.6 },
        "fenghechat-mini": { name: "qwen2.5:0.5b", temperature: 0.6 },
        "deepseek-reasoner": { name: "deepseek-r1:1.5b", temperature: 0.6 },
        "deepseek-chat": { name: "deepseek-chat", temperature: 0.6 },
      };
      const modelConfig = modelMap[modelId] || { name: "gemma3:12b", temperature: 0.6 };
      const localModel = modelConfig.name;
      const baseURL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api";

      try {
         const psRes = await fetch(`${baseURL}/ps`);
         if (psRes.ok) {
            const psData = await psRes.json();
            const isRunning = psData.models?.some((m: any) => m.name === localModel || m.model === localModel);
            if (!isRunning) {
               return res.json({ title: text.substring(0, 15) }); // Fallback title without pulling model
            }
         }
      } catch (err) {
         // silently proceed or ignore
      }

      const response = await fetch(`${baseURL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelConfig.name,
          prompt: `Summarize the following text into a very concise title (maximum 10 chars, return ONLY the title without any quotation marks or extra words):\n\n${text}`,
          stream: false,
          options: {
            temperature: 0.3,
          }
        }),
      });
      if (response.ok) {
         const data = await response.json();
         let title = data.response.trim().replace(/^["']|["']$/g, '');
         if (title.length > 20) title = title.substring(0, 20) + "...";
         res.json({ title });
      } else {
         res.json({ title: text.substring(0, 15) });
      }
    } catch(e) {
      res.json({ title: req.body.text.substring(0, 15) });
    }
  });

  // API Route for chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, modelId, isWebSearchMode } = req.body;
      
      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "No messages provided." });
      }

      // Map user selected UI models
      const modelMap: Record<string, { name: string, temperature?: number, top_p?: number, top_k?: number }> = {
        "fenghechat-unlimited": { name: "huihui_ai/gemma-4-abliterated:26b", temperature: 1.1, top_p: 0.95, top_k: 50 },
        "fenghechat-pro": { name: "huihui_ai/gemma-4-abliterated:26b", temperature: 0.7, top_p: 0.9, top_k: 40 },
        "fenghechat-flash": { name: "gemma3:12b", temperature: 0.6, top_p: 0.9, top_k: 40 },
        "fenghechat-mini": { name: "qwen2.5:0.5b", temperature: 0.5, top_p: 0.85, top_k: 40 },
        "deepseek-reasoner": { name: "deepseek-r1:1.5b", temperature: 0.5, top_p: 0.9, top_k: 40 },
        "deepseek-chat": { name: "deepseek-chat", temperature: 0.7, top_p: 0.9, top_k: 40 },
      };
      
      const modelConfig = modelMap[modelId] || { name: "gemma3:12b", temperature: 0.6, top_p: 0.9 };
      const localModel = modelConfig.name;
      const baseURL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api";

      // PRE-CHECK: Ensure model is actually running
      try {
         const psRes = await fetch(`${baseURL}/ps`);
         if (psRes.ok) {
            const psData = await psRes.json();
            const isRunning = psData.models?.some((m: any) => m.name === localModel || m.model === localModel);
            if (!isRunning) {
               return res.status(503).json({ error: `错误：模型【${localModel}】当前未运行或已从内存中卸载。为了防止爆显存，不会自动拉起。请在 Ollama / 客户端中确保模型处于运行状态后再试。` });
            }
         }
      } catch (err) {
         console.warn("Failed to check /api/ps", err);
         // If PS check fails for some connection reason, it will likely fail later too, or we can just proceed.
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let systemPrompt = req.body.systemPrompt || "You are a helpful conversational AI.";
      
      const abortController = new AbortController();
      // Listen to request aborted to cancel Ollama request
      req.on('aborted', () => {
          abortController.abort();
      });
      
      if (isWebSearchMode && messages.length > 0) {
         try {
             console.log("Starting Web search...");
             const lastUserMsg = messages[messages.length - 1].text;
             const ddgController = new AbortController();
             const timeoutId = setTimeout(() => ddgController.abort(), 3500);
             
             const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(lastUserMsg)}`, {
                 headers: {
                     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
                 },
                 signal: ddgController.signal
             });
             clearTimeout(timeoutId);

             if (ddgRes.ok) {
                 const html = await ddgRes.text();
                 
                 // Extract results properly
                 const resultBlocks = html.split('<div class="result__body links_main links_deep">').slice(1, 11); // max 10
                 const searchResults = [];
                 
                 // fallback if standard blocks don't exist
                 if (resultBlocks.length === 0) {
                     const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
                     let match;
                     while ((match = snippetRegex.exec(html)) !== null && searchResults.length < 5) {
                         let text = match[1].replace(/<[^>]+>/g, '').trim().replace(/&\w+;/g, ' ');
                         if (text) searchResults.push(`Snippet: ${text}`);
                     }
                 } else {
                     for (const block of resultBlocks) {
                         const titleMatch = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
                         const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);
                         const urlMatch = block.match(/<a class="result__url" href="([^"]+)"/);
                         
                         if (snippetMatch) {
                             let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Result";
                             let snippet = snippetMatch[1].replace(/<[^>]+>/g, '').trim().replace(/&\w+;/g, ' ');
                             let url = urlMatch ? decodeURIComponent(urlMatch[1]) : "";
                             if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
                                 url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
                             }
                             if (snippet) {
                                 searchResults.push(`Title: ${title}\nURL: ${url}\nSnippet: ${snippet}`);
                             }
                         }
                     }
                 }
                 
                 if (searchResults.length > 0) {
                     systemPrompt += `\n\n[Web Search Context]\nYou have access to the following real-time web search results for the user's query:\n\n${searchResults.join("\n\n---\n\n")}\n\nPlease synthesize this context to answer the user's question accurately. Whenever you use facts derived from these results, you MUST cite them by referring to the Title or URL provided. Do not hallucinate links.`;
                     console.log(`Injected ${searchResults.length} search results into context.`);
                 } else {
                     console.log("No search results could be extracted.");
                 }
             } else {
                 console.log("Search request failed with status:", ddgRes.status);
             }
         } catch(e) {
             console.error("Web search failed:", e);
         }
      }

      // Limit context to last 30 messages
      let recentMessages = messages;
      if (messages.length > 30) {
         recentMessages = messages.slice(-30);
      }

      // 1. FORMAT MESSAGES
      const isGemma = localModel.includes('gemma');
      const isDeepSeek = localModel.includes('deepseek');
      const isDeepThinkingMode = req.body.isDeepThinkingMode !== false; // Default to true
      let finalSystemPrompt = systemPrompt;
      
      if (isDeepThinkingMode && isDeepSeek) {
          finalSystemPrompt += "\n\nPlease think deeply before answering. Wrap your thought process in <think> and </think> tags.";
      } else if (isDeepThinkingMode && isGemma) {
          finalSystemPrompt += "\n\nPlease think deeply before answering. Wrap your thought process in <|channel>thought and <channel|> tags.";
      } else if (!isDeepThinkingMode && isGemma) {
          finalSystemPrompt += "\n\nRespond directly. Do NOT output any thought process or <|channel>thought tags.";
      }
      
      let endpoint = `${baseURL}/chat`;
      let requestBody: any = {
        model: localModel,
        stream: true,
        options: {
            temperature: modelConfig.temperature,
            top_p: modelConfig.top_p,
        }
      };
      
      if (modelConfig.top_k !== undefined) {
         requestBody.options.top_k = modelConfig.top_k;
      }
      
      if (isGemma || isDeepSeek) {
          endpoint = `${baseURL}/generate`;
          requestBody.raw = true;
          let rawPrompt = "";
          
          if (isGemma) {
              rawPrompt = "<bos>";
              if (finalSystemPrompt.trim()) {
                  rawPrompt += `<|turn>system\n${finalSystemPrompt.trim()}<turn|>\n`;
              }
              for (const m of recentMessages) {
                  let text = m.text;
                  // If the text contains <|channel>thought but never closes it with <channel|>, close it so it doesn't break future turns
                  if (text.includes("<|channel>thought") && !text.includes("<channel|>")) {
                      text += "\n<channel|>";
                  }
                  const role = m.role === "model" ? "model" : "user";
                  rawPrompt += `<|turn>${role}\n${text}<turn|>\n`;
              }
              rawPrompt += `<|turn>model\n`;
              requestBody.stop = ["<turn|>", "<end_of_turn>"];
          } else if (isDeepSeek) {
              let firstUser = true;
              for (const m of recentMessages) {
                  if (m.role === "model") {
                      rawPrompt += `<｜Assistant｜>${m.text}<｜end▁of▁sentence｜>`;
                  } else {
                      let text = m.text;
                      if (firstUser && finalSystemPrompt.trim()) {
                          text = `${finalSystemPrompt.trim()}\n\n${text}`;
                          firstUser = false;
                      }
                      rawPrompt += `<｜User｜>${text}`;
                  }
              }
              rawPrompt += `<｜Assistant｜>`;
              requestBody.stop = ["<｜end▁of▁sentence｜>"];
          }
          requestBody.prompt = rawPrompt;
      } else {
          requestBody.messages = [
            { role: "system", content: finalSystemPrompt },
            ...recentMessages.map((m: any) => ({
              role: m.role === "model" ? "assistant" : "user",
              content: m.text,
            })),
          ];
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Ollama API error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error("No response body from Ollama API");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseLineBuffer = "";
      const blockedTokens = ["<end_of_turn>", "<start_of_turn>", "<eos>", "<bos>", "<|im_start|>", "<|im_end|>"];
      let hasStartedThinking = false;
      let hasEndedThinking = false;

      while (true) {
        const { done, value } = await reader.read();
        
        let chunkStr = "";
        if (value) {
            chunkStr = decoder.decode(value, { stream: true });
        }
        
        sseLineBuffer += chunkStr;
        const lines = sseLineBuffer.split('\n');
        sseLineBuffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          try {
            const parsed = JSON.parse(trimmed);
            let textOut = "";
            let addedText = false;
            
            let chunkContent = "";
            let chunkReasoning = "";
            
            if (parsed.message) {
               chunkContent = parsed.message.content !== undefined ? parsed.message.content : "";
               chunkReasoning = parsed.message.reasoning_content || "";
            } else if (parsed.response !== undefined) {
               chunkContent = parsed.response;
            }
            
            if (chunkReasoning) {
               if (!hasStartedThinking) {
                   textOut += "<think>\n";
                   hasStartedThinking = true;
               }
               textOut += chunkReasoning;
               addedText = true;
            }
            
            if (chunkContent !== undefined && chunkContent !== null) {
               if (hasStartedThinking && !hasEndedThinking && chunkContent !== "") {
                   textOut += "\n</think>\n\n";
                   hasEndedThinking = true;
               }
               textOut += chunkContent;
               if (chunkContent !== "") addedText = true;
            }
            
            if (!addedText) continue;
            
            if (textOut) {
              for (const token of blockedTokens) {
                 textOut = textOut.split(token).join("");
              }
              if (textOut) {
                 res.write(`data: ${JSON.stringify({ text: textOut })}\n\n`);
              }
            }
          } catch(e) {
            // ignore partial JSON
          }
        }
        
        if (done) break;
      }
      
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        console.log("Ollama request aborted internally (client closed connection).");
        return res.end();
      }
      
      console.error("Chat API error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Something went wrong" });
      } else {
        res.write(`data: ${JSON.stringify({ text: `\n\n[System Error]: Local Engine Disconnected or Crashed. Please check if Ollama is running and has enough memory.` })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
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
    // Production serving
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
