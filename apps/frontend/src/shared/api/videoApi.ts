import {
  createApi,
  fetchBaseQuery,
  type FetchBaseQueryError
} from "@reduxjs/toolkit/query/react";
import type {
  DownloadRequest,
  DownloadResponse,
  MetadataRequest,
  VideoMetadataResponse
} from "../types/video";
import { buildApiUrl } from "./baseUrl";

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

export const videoApi = createApi({
  reducerPath: "videoApi",
  baseQuery: fetchBaseQuery({
    baseUrl: buildApiUrl("/api")
  }),
  endpoints: (builder) => ({
    fetchMetadata: builder.mutation<VideoMetadataResponse, MetadataRequest>({
      query: (payload) => ({
        url: "/videos/metadata",
        method: "POST",
        body: payload
      })
    }),
    downloadVideo: builder.mutation<DownloadResponse, DownloadRequest>({
      async queryFn(payload) {
        try {
          const response = await fetch(buildApiUrl("/api/videos/download"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const fallbackMessage = "Download failed.";
            const errorBody =
              (await response.json().catch(() => null)) as
                | { message?: string }
                | null;
            const message = errorBody?.message ?? fallbackMessage;
            return {
              error: {
                status: response.status,
                data: { message }
              } as FetchBaseQueryError
            };
          }

          const blob = await response.blob();
          return {
            data: {
              blob,
              filename: parseFilename(
                response.headers.get("content-disposition")
              )
            }
          };
        } catch (error) {
          return {
            error: {
              status: "FETCH_ERROR",
              error:
                error instanceof Error ? error.message : "Unexpected error."
            } as FetchBaseQueryError
          };
        }
      }
    })
  })
});

export const { useFetchMetadataMutation, useDownloadVideoMutation } = videoApi;
