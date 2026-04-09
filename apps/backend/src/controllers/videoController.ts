import type { Request, Response } from "express";
import { createReadStream } from "node:fs";
import { downloadSchema, metadataSchema } from "../schemas/videoSchemas";
import { fetchVideoMetadata, prepareVideoDownload } from "../services/videoService";

export const handleMetadata = async (request: Request, response: Response): Promise<void> => {
  const validation = metadataSchema.safeParse(request.body);
  if (!validation.success) {
    response.status(400).json({
      message: "Invalid request body.",
      issues: validation.error.flatten()
    });
    return;
  }

  try {
    const metadata = await fetchVideoMetadata(validation.data.url);
    response.status(200).json(metadata);
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Metadata fetch failed."
    });
  }
};

export const handleDownload = async (request: Request, response: Response): Promise<void> => {
  const validation = downloadSchema.safeParse(request.body);
  if (!validation.success) {
    response.status(400).json({
      message: "Invalid request body.",
      issues: validation.error.flatten()
    });
    return;
  }

  try {
    const prepared = await prepareVideoDownload(validation.data);
    const stream = createReadStream(prepared.filePath);
    let completed = false;

    const safeCleanup = async (): Promise<void> => {
      if (completed) {
        return;
      }
      completed = true;
      await prepared.cleanup();
    };

    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${prepared.fileName}"`
    );
    response.setHeader("Content-Type", prepared.mimeType);

    response.on("finish", () => {
      void safeCleanup();
    });
    response.on("close", () => {
      void safeCleanup();
    });
    stream.on("error", () => {
      void safeCleanup();
      if (!response.headersSent) {
        response.status(500).json({ message: "File streaming failed." });
      } else {
        response.end();
      }
    });

    stream.pipe(response);
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Download failed."
    });
  }
};

