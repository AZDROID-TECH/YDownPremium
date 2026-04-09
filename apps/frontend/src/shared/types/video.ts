export type VideoQuality = "360p" | "720p" | "1080p" | "4k";
export type VideoFormat = "mp4" | "mp3";

export interface VideoMetadataResponse {
  title: string;
  thumbnail: string | null;
  duration: number;
  availableQualities: VideoQuality[];
}

export interface MetadataRequest {
  url: string;
}

export interface DownloadRequest {
  url: string;
  quality: VideoQuality;
  format: VideoFormat;
  startTime?: string;
  endTime?: string;
}

export interface DownloadResponse {
  blob: Blob;
  filename: string;
}

