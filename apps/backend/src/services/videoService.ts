import { constants as fsConstants, promises as fs } from "node:fs";
import { randomInt } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { DownloadRequest, MetadataResponse, VideoQuality } from "../types/video";
import { runCommand } from "../utils/command";

interface YtDlpFormat {
  height?: number | null;
}

interface YtDlpMetadata {
  title?: string;
  thumbnail?: string;
  duration?: number;
  formats?: YtDlpFormat[];
}

export interface PreparedDownload {
  filePath: string;
  fileName: string;
  mimeType: string;
  cleanup: () => Promise<void>;
}

const qualityMap: Array<{ quality: VideoQuality; minHeight: number }> = [
  { quality: "4k", minHeight: 2160 },
  { quality: "1080p", minHeight: 1080 },
  { quality: "720p", minHeight: 720 },
  { quality: "360p", minHeight: 360 }
];

const DEFAULT_YOUTUBE_EXTRACTOR_ARGS = "youtube:player_client=web_safari,android_vr";
let cachedYtDlpBinary: string | null = null;
let cachedYoutubeExtractorArgs: string | null = null;
let cachedCookiesFilePath: string | null | undefined = undefined;

const mimeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
  ".m4a": "audio/mp4"
};

const DOWNLOAD_FILE_PREFIX = "ydownpremium-azdroidtech";

const createDownloadFileName = (extension: string): string => {
  const randomSuffix = randomInt(100_000, 1_000_000);
  return `${DOWNLOAD_FILE_PREFIX}-${randomSuffix}${extension}`;
};

const getMaxHeight = (quality: VideoQuality): number => {
  if (quality === "4k") {
    return 2160;
  }
  if (quality === "1080p") {
    return 1080;
  }
  if (quality === "720p") {
    return 720;
  }
  return 360;
};

const createVideoSelector = (quality: VideoQuality): string => {
  const maxHeight = getMaxHeight(quality);
  return `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]/bestvideo[height<=${maxHeight}]+bestaudio/bv*+ba/best`;
};

const clearDirectory = async (directory: string): Promise<void> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(entryPath, { recursive: true, force: true });
        return;
      }
      await fs.unlink(entryPath).catch(() => undefined);
    })
  );
};

const isFormatUnavailableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes("Requested format is not available");

const isBotProtectionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const lowered = error.message.toLowerCase();
  return lowered.includes("sign in to confirm") && lowered.includes("not a bot");
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "number" || typeof error === "boolean") {
    return `${error}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const toPublicYtDlpErrorMessage = (error: unknown): string => {
  if (isBotProtectionError(error)) {
    return "YouTube blocked this request with bot verification. Set YTDLP_COOKIES_FILE or YTDLP_COOKIES_B64 on the backend service and redeploy.";
  }

  return toErrorMessage(error);
};

const canExecute = async (binaryPath: string): Promise<boolean> => {
  try {
    await fs.access(binaryPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const canRead = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const getYoutubeExtractorArgs = (): string => {
  if (cachedYoutubeExtractorArgs !== null) {
    return cachedYoutubeExtractorArgs;
  }

  const fromEnvironment = process.env.YTDLP_YOUTUBE_EXTRACTOR_ARGS?.trim();
  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    cachedYoutubeExtractorArgs = fromEnvironment;
    return fromEnvironment;
  }

  cachedYoutubeExtractorArgs = DEFAULT_YOUTUBE_EXTRACTOR_ARGS;
  return DEFAULT_YOUTUBE_EXTRACTOR_ARGS;
};

const readCookiesFromEnvironment = (): string | null => {
  const inlineCookies = process.env.YTDLP_COOKIES?.trim();
  if (inlineCookies !== undefined && inlineCookies.length > 0) {
    return inlineCookies.replace(/\\n/g, "\n");
  }

  const base64Cookies = process.env.YTDLP_COOKIES_B64?.trim();
  if (base64Cookies === undefined || base64Cookies.length === 0) {
    return null;
  }

  try {
    return Buffer.from(base64Cookies, "base64").toString("utf8");
  } catch {
    throw new Error("YTDLP_COOKIES_B64 is not a valid base64 string.");
  }
};

const resolveCookiesFile = async (): Promise<string | null> => {
  if (cachedCookiesFilePath !== undefined) {
    return cachedCookiesFilePath;
  }

  const explicitCookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
  if (explicitCookiesFile !== undefined && explicitCookiesFile.length > 0) {
    const readable = await canRead(explicitCookiesFile);
    if (!readable) {
      throw new Error(
        "YTDLP_COOKIES_FILE is set but file is not readable on the server."
      );
    }
    cachedCookiesFilePath = explicitCookiesFile;
    return explicitCookiesFile;
  }

  const cookiesFromEnvironment = readCookiesFromEnvironment();
  if (cookiesFromEnvironment === null) {
    cachedCookiesFilePath = null;
    return null;
  }

  const tempCookiesPath = path.join(os.tmpdir(), "ydownpremium-ytdlp-cookies.txt");
  await fs.writeFile(tempCookiesPath, cookiesFromEnvironment, {
    encoding: "utf8",
    mode: 0o600
  });
  cachedCookiesFilePath = tempCookiesPath;
  return tempCookiesPath;
};

const buildYtDlpSharedArgs = async (): Promise<string[]> => {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--extractor-args",
    getYoutubeExtractorArgs()
  ];

  const cookiesFile = await resolveCookiesFile();
  if (cookiesFile !== null) {
    args.push("--cookies", cookiesFile);
  }

  return args;
};

const resolveYtDlpBinary = async (): Promise<string> => {
  if (cachedYtDlpBinary !== null) {
    return cachedYtDlpBinary;
  }

  const explicitBinary = process.env.YTDLP_BINARY?.trim();
  const defaultCandidates = ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", "yt-dlp"];
  const candidates =
    explicitBinary !== undefined && explicitBinary.length > 0
      ? [explicitBinary, ...defaultCandidates]
      : defaultCandidates;
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const isAbsolutePath = candidate.includes("/");
    if (isAbsolutePath) {
      const executable = await canExecute(candidate);
      if (!executable) {
        continue;
      }
    }

    try {
      await runCommand(candidate, ["--version"]);
      cachedYtDlpBinary = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Working yt-dlp binary was not found. Install yt-dlp or set a valid YTDLP_BINARY path."
  );
};

const tryYtDlpWithFallback = async (
  ytDlpBinary: string,
  baseArgs: string[],
  selectors: string[],
  outputFormat: "mp4" | "mp3",
  url: string,
  tempDir: string
): Promise<void> => {
  let lastError: unknown = null;

  for (const selector of selectors) {
    await clearDirectory(tempDir);
    const args = [...baseArgs, "-f", selector];

    if (outputFormat === "mp4") {
      args.push("--merge-output-format", "mp4");
    } else {
      args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    }

    args.push(url);

    try {
      await runCommand(ytDlpBinary, args, tempDir);
      return;
    } catch (error) {
      lastError = error;
      if (!isFormatUnavailableError(error)) {
        throw error;
      }
    }
  }

  await clearDirectory(tempDir);
  const autoArgs = [...baseArgs];

  if (outputFormat === "mp4") {
    autoArgs.push("--remux-video", "mp4");
  } else {
    autoArgs.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  }

  autoArgs.push(url);

  try {
    await runCommand(ytDlpBinary, autoArgs, tempDir);
    return;
  } catch (fallbackError) {
    lastError = fallbackError;
  }

  if (lastError !== null) {
    throw new Error(toErrorMessage(lastError));
  }

  throw new Error("No download selector could be executed.");
};

const getQualities = (formats: YtDlpFormat[]): VideoQuality[] => {
  const heights = formats
    .map((item) => item.height)
    .filter((item): item is number => item !== undefined && item !== null);

  if (heights.length === 0) {
    return ["360p"];
  }

  return qualityMap
    .filter((entry) => heights.some((height) => height >= entry.minHeight))
    .map((entry) => entry.quality);
};

const latestFileIn = async (directory: string): Promise<string> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
    .filter(
      (filePath) =>
        !filePath.endsWith(".part") &&
        !filePath.endsWith(".ytdl") &&
        !filePath.endsWith(".json")
    );

  if (files.length === 0) {
    throw new Error("Downloaded file was not found.");
  }

  const withStats = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      stat: await fs.stat(filePath)
    }))
  );

  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return withStats[0].filePath;
};

const normalizeOutput = async (
  sourcePath: string,
  targetFormat: "mp4" | "mp3",
  tempDir: string
): Promise<string> => {
  const currentExt = path.extname(sourcePath).toLowerCase();
  const targetExt = `.${targetFormat}`;

  if (currentExt === targetExt) {
    return sourcePath;
  }

  const convertedPath = path.join(tempDir, `converted${targetExt}`);

  if (targetFormat === "mp4") {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      convertedPath
    ]);
  } else {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "2",
      convertedPath
    ]);
  }

  await fs.unlink(sourcePath).catch(() => undefined);
  return convertedPath;
};

export const fetchVideoMetadata = async (url: string): Promise<MetadataResponse> => {
  const ytDlpBinary = await resolveYtDlpBinary();
  const sharedArgs = await buildYtDlpSharedArgs();
  let stdout = "";

  try {
    const result = await runCommand(ytDlpBinary, ["-J", "--skip-download", ...sharedArgs, url]);
    stdout = result.stdout;
  } catch (error) {
    throw new Error(toPublicYtDlpErrorMessage(error));
  }

  const parsed = JSON.parse(stdout) as YtDlpMetadata;
  const formats = parsed.formats ?? [];

  return {
    title: parsed.title ?? "Unknown title",
    thumbnail: parsed.thumbnail ?? null,
    duration: parsed.duration ?? 0,
    availableQualities: getQualities(formats)
  };
};

export const prepareVideoDownload = async (
  payload: DownloadRequest
): Promise<PreparedDownload> => {
  const ytDlpBinary = await resolveYtDlpBinary();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ydown-"));
  let cleaned = false;

  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await fs.rm(tempDir, { recursive: true, force: true });
  };

  const outputTemplate = path.join(tempDir, "source.%(ext)s");
  const baseArgs = [...(await buildYtDlpSharedArgs()), "-o", outputTemplate];

  if (payload.startTime !== undefined && payload.endTime !== undefined) {
    baseArgs.push(
      "--download-sections",
      `*${payload.startTime}-${payload.endTime}`,
      "--force-keyframes-at-cuts"
    );
  }

  try {
    if (payload.format === "mp3") {
      await tryYtDlpWithFallback(
        ytDlpBinary,
        baseArgs,
        ["bestaudio/best", "bestaudio", "best"],
        "mp3",
        payload.url,
        tempDir
      );
    } else {
      const maxHeight = getMaxHeight(payload.quality);
      await tryYtDlpWithFallback(
        ytDlpBinary,
        baseArgs,
        [
          createVideoSelector(payload.quality),
          `best[height<=${maxHeight}]/best`,
          "bestvideo+bestaudio/best",
          "best"
        ],
        "mp4",
        payload.url,
        tempDir
      );
    }

    const downloadedPath = await latestFileIn(tempDir);
    const normalizedPath = await normalizeOutput(downloadedPath, payload.format, tempDir);

    const extension = path.extname(normalizedPath).toLowerCase();
    const mimeType = mimeByExtension[extension] ?? "application/octet-stream";
    const fileName = createDownloadFileName(extension);

    return {
      filePath: normalizedPath,
      fileName,
      mimeType,
      cleanup
    };
  } catch (error) {
    await cleanup();
    throw new Error(toPublicYtDlpErrorMessage(error));
  }
};
