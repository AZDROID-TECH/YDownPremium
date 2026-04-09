export type VideoQuality = "360p" | "720p" | "1080p" | "4k";
export type VideoFormat = "mp4" | "mp3";

export interface MetadataResponse {
  title: string;
  thumbnail: string | null;
  duration: number;
  availableQualities: VideoQuality[];
}

export interface DownloadRequest {
  url: string;
  quality: VideoQuality;
  format: VideoFormat;
  startTime?: string;
  endTime?: string;
}

