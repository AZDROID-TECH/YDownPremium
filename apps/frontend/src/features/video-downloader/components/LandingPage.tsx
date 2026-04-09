import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { useFetchMetadataMutation } from "../../../shared/api/videoApi";
import { buildApiUrl } from "../../../shared/api/baseUrl";
import type { VideoFormat, VideoQuality } from "../../../shared/types/video";
import { formatDuration, parseTimeToSeconds, TIME_PATTERN } from "../model/time";
import { setSelectedFormat, setSelectedQuality, setUrl } from "../model/videoSlice";

const HISTORY_STORAGE_KEY = "ydown_history_v1";
const THEME_STORAGE_KEY = "ydown_theme_v1";

const urlSchema = z.object({
  url: z.string().trim().min(1, "invalidUrl")
});

type UrlSchema = z.infer<typeof urlSchema>;
type ToastType = "success" | "error" | "info";
type ThemeMode = "dark" | "light";

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface DownloadProgress {
  phase: "idle" | "processing" | "downloading";
  percent: number | null;
}

interface DownloadHistoryItem {
  id: string;
  title: string;
  url: string;
  quality: VideoQuality;
  format: VideoFormat;
  range: string | null;
  downloadedAt: string;
}

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const parseFilename = (value: string | null): string => {
  if (value === null) {
    return "video";
  }

  const utfMatch = value.match(/filename\\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1] !== undefined) {
    return decodeURIComponent(utfMatch[1]);
  }

  const asciiMatch = value.match(/filename="?([^"]+)"?/i);
  if (asciiMatch?.[1] !== undefined) {
    return asciiMatch[1];
  }

  return "video";
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  return payload?.message ?? "Request failed.";
};

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Request failed.";
};

const triggerFileDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

const getYouTubeVideoId = (rawUrl: string): string | null => {
  try {
    const normalizedUrl = normalizeUrl(rawUrl);
    if (normalizedUrl.length === 0) {
      return null;
    }

    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "").trim();
      return id.length > 0 ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const watchId = parsed.searchParams.get("v");
      if (watchId !== null && watchId.trim().length > 0) {
        return watchId.trim();
      }

      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (
        pathParts.length >= 2 &&
        (pathParts[0] === "embed" || pathParts[0] === "shorts")
      ) {
        return pathParts[1];
      }
    }
  } catch {
    return null;
  }

  return null;
};

const qualityOrder: VideoQuality[] = ["4k", "1080p", "720p", "360p"];
const languageCodes = ["az", "en", "tr", "ru"] as const;

const getToastStyle = (type: ToastType): string => {
  if (type === "success") {
    return "border-primary/40 bg-primary/10 text-primary";
  }

  if (type === "error") {
    return "border-error/40 bg-error-container/30 text-error";
  }

  return "border-outline-variant/40 bg-surface-container-high text-on-surface";
};

const isVideoQuality = (value: unknown): value is VideoQuality =>
  value === "360p" || value === "720p" || value === "1080p" || value === "4k";

const isVideoFormat = (value: unknown): value is VideoFormat =>
  value === "mp4" || value === "mp3";

const isDownloadHistoryItem = (value: unknown): value is DownloadHistoryItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.url === "string" &&
    isVideoQuality(candidate.quality) &&
    isVideoFormat(candidate.format) &&
    (typeof candidate.range === "string" || candidate.range === null) &&
    typeof candidate.downloadedAt === "string"
  );
};

const loadHistory = (): DownloadHistoryItem[] => {
  const rawValue = window.localStorage.getItem(HISTORY_STORAGE_KEY);
  if (rawValue === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDownloadHistoryItem);
  } catch {
    return [];
  }
};

const persistHistory = (historyItems: DownloadHistoryItem[]): void => {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
};

const loadTheme = (): ThemeMode => {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "light" ? "light" : "dark";
};

export const LandingPage = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { url, selectedFormat, selectedQuality } = useAppSelector((state) => state.video);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isClipInlineOpen, setIsClipInlineOpen] = useState(false);
  const [clipStartTime, setClipStartTime] = useState("01:00");
  const [clipEndTime, setClipEndTime] = useState("01:50");
  const [clipValidationError, setClipValidationError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    phase: "idle",
    percent: null
  });
  const [historyItems, setHistoryItems] = useState<DownloadHistoryItem[]>(() =>
    loadHistory()
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadTheme());
  const toastTimersRef = useRef<number[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors }
  } = useForm<UrlSchema>({
    resolver: zodResolver(urlSchema),
    defaultValues: { url: "" }
  });
  const watchedUrl = watch("url");

  const [fetchMetadata, metadataResult] = useFetchMetadataMutation();

  useEffect(() => {
    dispatch(setUrl(watchedUrl.trim()));
  }, [dispatch, watchedUrl]);

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(
    () => () => {
      toastTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      toastTimersRef.current = [];
    },
    []
  );

  const pushToast = (type: ToastType, message: string): void => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((previous) => [...previous, { id, type, message }]);
    const timer = window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, 4200);
    toastTimersRef.current.push(timer);
  };

  const availableQualities = useMemo(() => {
    if (metadataResult.data?.availableQualities === undefined) {
      return [];
    }

    const sorted = [...metadataResult.data.availableQualities];
    sorted.sort(
      (left, right) => qualityOrder.indexOf(left) - qualityOrder.indexOf(right)
    );
    return sorted;
  }, [metadataResult.data?.availableQualities]);

  const previewVideoId = useMemo(() => getYouTubeVideoId(url), [url]);

  const requestMetadataByUrl = async (rawUrl: string): Promise<void> => {
    const normalizedUrl = normalizeUrl(rawUrl);
    setValue("url", normalizedUrl, { shouldValidate: true, shouldDirty: true });
    dispatch(setUrl(normalizedUrl));

    const validation = z.string().url().safeParse(normalizedUrl);
    if (!validation.success) {
      setError("url", { type: "validate", message: "invalidUrl" });
      pushToast("error", t("invalidUrl"));
      return;
    }

    clearErrors("url");

    try {
      const response = await fetchMetadata({ url: normalizedUrl }).unwrap();
      if (response.availableQualities.length === 0) {
        pushToast("error", t("qualityUnknown"));
        return;
      }

      const preferredQuality = response.availableQualities.includes(selectedQuality)
        ? selectedQuality
        : response.availableQualities[0];
      dispatch(setSelectedQuality(preferredQuality));
      dispatch(setSelectedFormat(null));
      setIsClipInlineOpen(false);
      setClipValidationError(null);
      pushToast("success", t("optionsReady"));
    } catch (error) {
      pushToast("error", extractErrorMessage(error));
    }
  };

  const onSubmitUrl = async (values: UrlSchema): Promise<void> => {
    await requestMetadataByUrl(values.url);
  };

  const handlePasteFromClipboard = (): void => {
    void navigator.clipboard
      .readText()
      .then(async (text) => {
        if (text.trim().length === 0) {
          pushToast("error", t("invalidUrl"));
          return;
        }
        await requestMetadataByUrl(text);
      })
      .catch(() => {
        pushToast("error", t("requestFailed"));
      });
  };

  const handleInputPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const pastedText = event.clipboardData.getData("text");
    if (pastedText.trim().length === 0) {
      return;
    }

    event.preventDefault();
    void requestMetadataByUrl(pastedText);
  };

  const appendHistoryItem = (item: DownloadHistoryItem): void => {
    setHistoryItems((previous) => {
      const nextItems = [item, ...previous].slice(0, 50);
      persistHistory(nextItems);
      return nextItems;
    });
  };

  const clearHistory = (): void => {
    setHistoryItems([]);
    persistHistory([]);
    pushToast("info", t("historyClear"));
  };

  const buildClipPayload = (): { startTime: string; endTime: string } | null => {
    const startTime = clipStartTime.trim();
    const endTime = clipEndTime.trim();
    const isTimeFormatValid =
      TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);

    if (!isTimeFormatValid) {
      setClipValidationError("invalidTimeRange");
      pushToast("error", t("invalidTimeRange"));
      return null;
    }

    const startSeconds = parseTimeToSeconds(startTime);
    const endSeconds = parseTimeToSeconds(endTime);
    if (
      startSeconds === null ||
      endSeconds === null ||
      startSeconds >= endSeconds
    ) {
      setClipValidationError("invalidTimeRange");
      pushToast("error", t("invalidTimeRange"));
      return null;
    }

    setClipValidationError(null);
    return { startTime, endTime };
  };

  const runDownload = async (
    payload: { startTime?: string; endTime?: string } = {}
  ): Promise<void> => {
    const normalizedUrl = normalizeUrl(url);
    const validation = z.string().url().safeParse(normalizedUrl);

    if (!validation.success) {
      pushToast("error", t("invalidUrl"));
      return;
    }

    if (selectedFormat === null) {
      pushToast("error", t("selectFormatRequired"));
      return;
    }

    setIsDownloading(true);
    setDownloadProgress({
      phase: "processing",
      percent: null
    });

    try {
      const response = await fetch(buildApiUrl("/api/videos/download"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: normalizedUrl,
          quality: selectedQuality,
          format: selectedFormat,
          ...payload
        })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }

      const fileName = parseFilename(response.headers.get("content-disposition"));
      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      const totalBytes = Number(response.headers.get("content-length") ?? "0");
      const reader = response.body?.getReader();

      if (reader === undefined) {
        const blob = await response.blob();
        triggerFileDownload(blob, fileName);
      } else {
        const chunks: BlobPart[] = [];
        let loadedBytes = 0;
        setDownloadProgress({
          phase: "downloading",
          percent: totalBytes > 0 ? 0 : null
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          chunks.push(new Uint8Array(value));
          loadedBytes += value.byteLength;
          if (totalBytes > 0) {
            setDownloadProgress({
              phase: "downloading",
              percent: Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            });
          }
        }

        const blob = new Blob(chunks, { type: contentType });
        triggerFileDownload(blob, fileName);
      }

      appendHistoryItem({
        id: `${Date.now()}`,
        title: metadataResult.data?.title ?? "Untitled",
        url: normalizedUrl,
        quality: selectedQuality,
        format: selectedFormat,
        range:
          payload.startTime !== undefined && payload.endTime !== undefined
            ? `${payload.startTime} - ${payload.endTime}`
            : null,
        downloadedAt: new Date().toISOString()
      });

      setIsClipInlineOpen(false);
      setClipValidationError(null);
      pushToast("success", t("successDownload"));
    } catch (error) {
      pushToast("error", extractErrorMessage(error));
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ phase: "idle", percent: null });
    }
  };

  const showQualityStep =
    metadataResult.data !== undefined && availableQualities.length > 0;
  const showFormatStep = showQualityStep;
  const showActionStep = showFormatStep && selectedFormat !== null;
  const hasEmbeddedPreview =
    previewVideoId !== null && metadataResult.data !== undefined;
  const embeddedPreviewSrc =
    previewVideoId !== null
      ? `https://www.youtube-nocookie.com/embed/${previewVideoId}?rel=0&modestbranding=1`
      : null;
  const progressLabel =
    downloadProgress.phase === "processing"
      ? t("progressPreparing")
      : t("progressDownloading");

  const isDarkMode = themeMode === "dark";
  const activeLanguageCode = languageCodes.find((code) => i18n.language.startsWith(code)) ?? "az";
  const pageClass = isDarkMode ? "bg-surface text-on-surface" : "bg-slate-100 text-slate-900";
  const headerClass = isDarkMode
    ? "sticky top-0 z-40 w-full bg-gradient-to-b from-[#0e0e0e] via-[#0e0e0e]/90 to-transparent"
    : "sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md";
  const panelCardClass = isDarkMode
    ? "border-outline-variant/25 bg-surface-container-low"
    : "border-slate-300 bg-white";
  const panelBorderClass = isDarkMode
    ? "border-outline-variant/25 bg-surface-container-low/70"
    : "border-slate-300 bg-white";
  const subCardClass = isDarkMode
    ? "border-outline-variant/30 bg-surface-container-low/40"
    : "border-slate-200 bg-slate-50";
  const mutedTextClass = isDarkMode ? "text-on-surface-variant" : "text-slate-600";
  const headingTextClass = isDarkMode ? "text-white" : "text-slate-900";
  const headerBrandTextClass = isDarkMode ? "text-white" : "text-slate-900";
  const inputClass = isDarkMode
    ? "border-outline-variant/30 bg-surface-container-lowest text-white placeholder:text-zinc-600"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400";
  const clipInputClass = isDarkMode
    ? "border-outline-variant/30 bg-surface-container-lowest text-white placeholder:text-zinc-600"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400";
  const modalSurfaceClass = isDarkMode
    ? "border-outline-variant/35 bg-[#17191f]"
    : "border-slate-300 bg-white";
  const modalItemClass = isDarkMode
    ? "border-outline-variant/30 bg-[#1d2028]"
    : "border-slate-200 bg-slate-50";
  const cycleLanguage = (): void => {
    const currentIndex = languageCodes.indexOf(activeLanguageCode);
    const nextCode = languageCodes[(currentIndex + 1) % languageCodes.length];
    void i18n.changeLanguage(nextCode);
  };
  const toggleTheme = (): void => {
    setThemeMode((previous) => (previous === "dark" ? "light" : "dark"));
  };

  return (
    <div className={`min-h-screen selection:bg-primary selection:text-on-primary ${pageClass}`}>
      <header className={headerClass}>
        <nav className="flex w-full items-center justify-between px-4 py-3 md:px-8">
          <div
            className={`flex items-center gap-2 text-xl font-bold tracking-tighter ${headerBrandTextClass}`}
          >
            <i className="bx bxs-play-circle text-primary text-2xl" />
            {t("appName")}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isDarkMode
                  ? "border-outline-variant/40 text-on-surface-variant hover:text-white"
                  : "border-slate-300 text-slate-700 hover:text-slate-900"
              }`}
              aria-label={t("language")}
              onClick={cycleLanguage}
            >
              <i className="bx bx-globe text-base" />
              {activeLanguageCode.toUpperCase()}
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isDarkMode
                  ? "border-outline-variant/40 text-on-surface-variant hover:text-white"
                  : "border-slate-300 text-slate-700 hover:text-slate-900"
              }`}
              aria-label={t("theme")}
              onClick={toggleTheme}
            >
              <i className={`bx ${isDarkMode ? "bx-sun" : "bx-moon"} text-base`} />
              {isDarkMode ? t("themeLight") : t("themeDark")}
            </button>
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-md border px-2.5 py-1.5 transition-colors duration-300 ${
                isDarkMode
                  ? "border-outline-variant/40 text-on-surface-variant hover:text-white"
                  : "border-slate-300 text-slate-700 hover:text-slate-900"
              }`}
              aria-label={t("history")}
              onClick={() => {
                setIsHistoryOpen(true);
              }}
            >
              <i className="bx bx-history text-lg" />
            </button>
          </div>
        </nav>
      </header>

      <div className="fixed right-4 top-4 z-[80] flex w-[320px] max-w-[90vw] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item rounded-md border px-4 py-3 text-sm shadow-xl ${getToastStyle(toast.type)}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <main className="w-full px-4 pb-24 pt-2 md:h-[calc(100vh-74px)] md:px-8 md:pb-4 md:pt-3">
        <section className="grid h-full grid-cols-1 gap-4 md:grid-cols-12">
          <article className="md:col-span-8">
            <div className={`h-[320px] overflow-hidden rounded-md border shadow-2xl md:h-full ${panelCardClass}`}>
              <div className="grid h-full grid-rows-[minmax(0,1fr)_auto]">
                <div className="min-h-0 overflow-hidden">
                  {hasEmbeddedPreview && embeddedPreviewSrc !== null ? (
                    <iframe
                      className="h-full w-full"
                      src={embeddedPreviewSrc}
                      title={metadataResult.data?.title ?? t("preview")}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : metadataResult.data?.thumbnail !== undefined &&
                    metadataResult.data.thumbnail !== null ? (
                    <img
                      src={metadataResult.data.thumbnail}
                      alt={metadataResult.data.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-md bg-primary/10">
                          <i className="bx bx-video text-3xl text-primary" />
                        </div>
                        <h2 className={`text-xl font-bold ${headingTextClass}`}>{t("previewEmptyTitle")}</h2>
                        <p className={`mt-1 text-sm ${mutedTextClass}`}>{t("previewEmptyText")}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`border-t px-4 py-3 ${isDarkMode ? "border-outline-variant/30 bg-surface-container-low/70" : "border-slate-200 bg-white/95"}`}>
                  <span className="rounded-md bg-primary/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                    {t("preview")}
                  </span>
                  <h2 className={`mt-2 line-clamp-2 text-lg font-bold md:text-xl ${headingTextClass}`}>
                    {metadataResult.data?.title ?? t("qualityUnknown")}
                  </h2>
                  {metadataResult.data !== undefined && (
                    <p className={`text-sm ${mutedTextClass}`}>
                      {t("durations")}: {formatDuration(metadataResult.data.duration)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </article>

          <article className="min-w-0 md:col-span-4">
            <div className={`flex h-full min-w-0 flex-col gap-4 rounded-md border p-4 shadow-xl ${panelBorderClass}`}>
              <div className="min-w-0 px-1 text-center md:px-0 md:text-left">
                <h1 className={`max-w-full break-words text-2xl font-bold leading-tight tracking-tight md:text-3xl ${headingTextClass}`}>
                  {t("linkTitle")}
                </h1>
                <p className={`mt-1 text-sm ${mutedTextClass}`}>{t("pasteHint")}</p>
              </div>

              <form
                className="mx-auto min-w-0 w-full max-w-xl space-y-2 md:mx-0 md:max-w-none"
                onSubmit={(event) => {
                  void handleSubmit(onSubmitUrl)(event);
                }}
              >
                <div className="group relative">
                  <input
                    {...register("url")}
                    onPaste={handleInputPaste}
                    className={`w-full rounded-md border px-4 py-4 pr-14 text-sm outline-none ring-primary transition-all focus:ring-2 ${inputClass}`}
                    placeholder={t("linkPlaceholder")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500 transition-colors hover:text-white"
                    onClick={handlePasteFromClipboard}
                    aria-label={t("paste")}
                  >
                    <i className="bx bx-paste text-xl" />
                  </button>
                </div>
                {errors.url !== undefined && (
                  <p className="text-center text-sm text-error md:text-left">{t("invalidUrl")}</p>
                )}
              </form>

              {metadataResult.isLoading && (
                <div className={`animate-fade-slide rounded-md border p-4 text-center text-sm md:text-left ${subCardClass} ${mutedTextClass}`}>
                  {t("loading")}
                </div>
              )}

              {showQualityStep && (
                <section className={`animate-fade-slide min-w-0 rounded-md border p-4 ${subCardClass}`}>
                  <h3 className={`mb-3 text-center text-xs uppercase tracking-widest md:text-left ${mutedTextClass}`}>
                    {t("quality")}
                  </h3>
                  <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                    {availableQualities.map((quality) => (
                      <button
                        key={quality}
                        type="button"
                        onClick={() => {
                          dispatch(setSelectedQuality(quality));
                          dispatch(setSelectedFormat(null));
                          setIsClipInlineOpen(false);
                          setClipValidationError(null);
                        }}
                        className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
                          selectedQuality === quality
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : `${isDarkMode ? "border-outline-variant/40 text-on-surface-variant hover:text-on-surface" : "border-slate-300 text-slate-600 hover:text-slate-900"}`
                        }`}
                      >
                        {quality === "4k" ? "4K" : quality}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {showFormatStep && (
                <section className={`animate-fade-slide min-w-0 rounded-md border p-4 ${subCardClass}`}>
                  <h3 className={`mb-3 text-center text-xs uppercase tracking-widest md:text-left ${mutedTextClass}`}>
                    {t("format")}
                  </h3>
                  <div className="flex items-center justify-center gap-2 md:justify-start">
                    {(["mp4", "mp3"] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => {
                          dispatch(setSelectedFormat(format));
                        }}
                        className={`rounded-md border px-4 py-2 text-xs font-bold uppercase transition-all ${
                          selectedFormat === format
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : `${isDarkMode ? "border-outline-variant/40 text-on-surface-variant hover:text-on-surface" : "border-slate-300 text-slate-600 hover:text-slate-900"}`
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                  {selectedFormat === null && (
                    <p className={`mt-2 text-center text-xs md:text-left ${mutedTextClass}`}>
                      {t("selectFormatHint")}
                    </p>
                  )}
                </section>
              )}

              {showActionStep && (
                <section className={`animate-fade-slide min-w-0 space-y-3 rounded-md border p-4 ${subCardClass}`}>
                  <div className="relative">
                    <div
                      className={`grid grid-cols-1 gap-3 transition-[opacity,transform,max-height] duration-300 ease-out md:grid-cols-2 ${
                        isClipInlineOpen
                          ? "pointer-events-none max-h-0 -translate-y-1 overflow-hidden opacity-0"
                          : "max-h-40 translate-y-0 opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void runDownload();
                        }}
                        disabled={isDownloading}
                        className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-br from-primary to-primary-container px-4 py-3 text-sm font-bold text-on-primary-fixed transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <i className="bx bx-download text-lg" />
                        {t("fullDownload")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsClipInlineOpen(true);
                          setClipValidationError(null);
                        }}
                        disabled={isDownloading}
                        className={`flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDarkMode
                            ? "border-outline-variant/40 text-primary hover:bg-surface-container-low"
                            : "border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <i className="bx bx-cut text-lg" />
                        {t("clipDownload")}
                      </button>
                    </div>

                    <div
                      className={`transition-[opacity,transform,max-height] duration-300 ease-out ${
                        isClipInlineOpen
                          ? "max-h-[520px] translate-y-0 opacity-100"
                          : "pointer-events-none max-h-0 -translate-y-1 overflow-hidden opacity-0"
                      }`}
                    >
                      <div
                        className={`space-y-3 rounded-md border p-3 ${
                          isDarkMode
                            ? "border-outline-variant/35 bg-surface-container-low/50"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-semibold uppercase tracking-widest ${mutedTextClass}`}>
                            {t("modalTitle")}
                          </p>
                          <button
                            type="button"
                            className={`rounded-md p-1 transition-colors ${
                              isDarkMode
                                ? "text-on-surface-variant hover:text-white"
                                : "text-slate-500 hover:text-slate-900"
                            }`}
                            aria-label={t("close")}
                            onClick={() => {
                              setIsClipInlineOpen(false);
                              setClipValidationError(null);
                            }}
                          >
                            <i className="bx bx-x text-xl" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="space-y-1">
                            <span className={`text-xs uppercase tracking-widest ${mutedTextClass}`}>
                              {t("modalStart")}
                            </span>
                            <input
                              type="text"
                              value={clipStartTime}
                              onChange={(event) => {
                                setClipStartTime(event.target.value);
                                if (clipValidationError !== null) {
                                  setClipValidationError(null);
                                }
                              }}
                              placeholder="01:00"
                              className={`w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary transition-all focus:ring-2 ${clipInputClass}`}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className={`text-xs uppercase tracking-widest ${mutedTextClass}`}>
                              {t("modalEnd")}
                            </span>
                            <input
                              type="text"
                              value={clipEndTime}
                              onChange={(event) => {
                                setClipEndTime(event.target.value);
                                if (clipValidationError !== null) {
                                  setClipValidationError(null);
                                }
                              }}
                              placeholder="01:50"
                              className={`w-full rounded-md border px-3 py-2 text-sm outline-none ring-primary transition-all focus:ring-2 ${clipInputClass}`}
                            />
                          </label>
                        </div>

                        {clipValidationError !== null && (
                          <p className="text-xs text-error">{t(clipValidationError)}</p>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const clipPayload = buildClipPayload();
                            if (clipPayload === null) {
                              return;
                            }
                            void runDownload(clipPayload);
                          }}
                          disabled={isDownloading}
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-br from-primary to-primary-container px-4 py-3 text-sm font-bold text-on-primary-fixed transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <i className="bx bx-download text-lg" />
                          {isDownloading ? t("loading") : t("modalConfirm")}
                        </button>
                      </div>
                    </div>
                  </div>

                  {downloadProgress.phase !== "idle" && (
                    <div className="space-y-2">
                      <div className={`h-2 overflow-hidden rounded-md ${isDarkMode ? "bg-surface-container-lowest" : "bg-slate-200"}`}>
                        {downloadProgress.percent === null ? (
                          <div className="progress-indeterminate relative h-full" />
                        ) : (
                          <div
                            className="h-full rounded-md bg-gradient-to-r from-primary to-tertiary transition-all duration-300"
                            style={{ width: `${downloadProgress.percent}%` }}
                          />
                        )}
                      </div>
                      <p className={`text-center text-xs md:text-left ${mutedTextClass}`}>
                        {progressLabel}
                        {downloadProgress.percent !== null && ` ${downloadProgress.percent}%`}
                      </p>
                    </div>
                  )}
                </section>
              )}

              <div className="mt-auto grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={`flex items-center justify-center gap-2 rounded-md border p-3 md:justify-start ${subCardClass}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                    <i className="bx bxs-bolt text-primary" />
                  </div>
                  <p className={`text-xs ${mutedTextClass}`}>{t("featureFastTitle")}</p>
                </div>
                <div className={`flex items-center justify-center gap-2 rounded-md border p-3 md:justify-start ${subCardClass}`}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-tertiary/10">
                    <i className="bx bxs-medal text-tertiary" />
                  </div>
                  <p className={`text-xs ${mutedTextClass}`}>{t("featureQualityTitle")}</p>
                </div>
              </div>
            </div>
          </article>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-md bg-[#131314]/85 px-6 pb-4 pt-2 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl md:hidden">
        <a
          className="flex items-center justify-center rounded-md border border-primary/30 bg-transparent px-5 py-2 text-[#75b0ff] transition-all active:scale-90"
          href="#"
        >
          <div className="flex flex-col items-center">
            <i className="bx bxs-home text-lg" />
            <span className="mt-1 font-headline text-[10px] font-bold uppercase tracking-widest">
              {t("navHome")}
            </span>
          </div>
        </a>
        <a
          className="flex items-center justify-center px-5 py-2 text-zinc-500 transition-all hover:bg-white/5 active:scale-90"
          href="#"
        >
          <div className="flex flex-col items-center">
            <i className="bx bx-download text-lg" />
            <span className="mt-1 font-headline text-[10px] font-bold uppercase tracking-widest">
              {t("navDownloads")}
            </span>
          </div>
        </a>
        <a
          className="flex items-center justify-center px-5 py-2 text-zinc-500 transition-all hover:bg-white/5 active:scale-90"
          href="#"
        >
          <div className="flex flex-col items-center">
            <i className="bx bx-user text-lg" />
            <span className="mt-1 font-headline text-[10px] font-bold uppercase tracking-widest">
              {t("navProfile")}
            </span>
          </div>
        </a>
      </nav>

      {isHistoryOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className={`animate-fade-slide relative z-10 w-full max-w-2xl rounded-md border p-4 shadow-2xl md:p-5 ${modalSurfaceClass}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className={`text-lg font-bold ${headingTextClass}`}>{t("historyTitle")}</h3>
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-xs ${isDarkMode ? "border-outline-variant/40 text-on-surface-variant" : "border-slate-300 text-slate-700"}`}
                onClick={() => {
                  setIsHistoryOpen(false);
                }}
              >
                {t("close")}
              </button>
            </div>

            {historyItems.length === 0 ? (
              <p className={`text-sm ${mutedTextClass}`}>{t("historyEmpty")}</p>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {historyItems.map((item) => (
                  <div key={item.id} className={`rounded-md border p-3 ${modalItemClass}`}>
                    <p className={`line-clamp-1 text-sm font-semibold ${headingTextClass}`}>{item.title}</p>
                    <p className={`line-clamp-1 text-xs ${mutedTextClass}`}>{item.url}</p>
                    <p className={`mt-1 text-xs ${mutedTextClass}`}>
                      {item.quality} • {item.format.toUpperCase()} • {t("historyDate")}: {new Date(item.downloadedAt).toLocaleString()}
                    </p>
                    {item.range !== null && (
                      <p className={`text-xs ${mutedTextClass}`}>
                        {t("historyRange")}: {item.range}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-xs font-semibold ${isDarkMode ? "border-outline-variant/40 text-on-surface-variant hover:text-on-surface" : "border-slate-300 text-slate-700"}`}
                onClick={clearHistory}
              >
                {t("historyClear")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
