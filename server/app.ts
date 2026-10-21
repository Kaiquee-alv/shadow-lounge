import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers.js";
import { createContext } from "./_core/context.js";
import { registerOAuthRoutes } from "./_core/oauth.js";
import { registerStorageProxy } from "./_core/storageProxy.js";
import { z } from "zod";
import { claimNextPrintJob, completePrintJob, pairPrinterAgent } from "./db.js";

export function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use("/api", (_req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/printer/pair", async (req, res) => {
    const input = z.object({
      pairingCode: z.string().min(20).max(60),
      computerName: z.string().trim().min(1).max(120),
      printerName: z.string().trim().min(1).max(160),
    }).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Dados de pareamento inválidos" });
    try {
      const result = await pairPrinterAgent(input.data);
      return res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao parear o agente";
      return res.status(message === "Agente não autorizado" ? 401 : 400).json({ error: message });
    }
  });
  app.post("/api/printer/jobs/next", async (req, res) => {
    const token = req.get("authorization")?.match(/^Bearer (.{1,200})$/i)?.[1] ?? "";
    try {
      const job = await claimNextPrintJob(token);
      return res.json({ job });
    } catch {
      return res.status(401).json({ error: "Agente não autorizado" });
    }
  });
  app.post("/api/printer/jobs/:jobId/result", async (req, res) => {
    const token = req.get("authorization")?.match(/^Bearer (.{1,200})$/i)?.[1] ?? "";
    const jobId = Number(req.params.jobId);
    const input = z.object({ status: z.enum(["printed", "failed"]), error: z.string().max(2000).optional() }).safeParse(req.body);
    if (!Number.isSafeInteger(jobId) || jobId < 1 || !input.success) return res.status(400).json({ error: "Resultado inválido" });
    try {
      const result = await completePrintJob({ token, jobId, ...input.data });
      return res.json(result);
    } catch {
      return res.status(401).json({ error: "Agente não autorizado" });
    }
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

export default createApp;
