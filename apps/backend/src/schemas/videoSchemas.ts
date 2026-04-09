import { z } from "zod";
import { isValidTime, parseTimeToSeconds } from "../utils/time";

export const metadataSchema = z.object({
  url: z.string().url()
});

export const downloadSchema = z
  .object({
    url: z.string().url(),
    quality: z.enum(["360p", "720p", "1080p", "4k"]),
    format: z.enum(["mp4", "mp3"]),
    startTime: z.string().optional(),
    endTime: z.string().optional()
  })
  .superRefine((value, context) => {
    if (value.startTime === undefined && value.endTime === undefined) {
      return;
    }

    if (value.startTime === undefined || value.endTime === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "startTime and endTime must be provided together."
      });
      return;
    }

    const startTime = value.startTime;
    const endTime = value.endTime;

    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "Time format must be MM:SS or HH:MM:SS."
      });
      return;
    }

    const start = parseTimeToSeconds(startTime);
    const end = parseTimeToSeconds(endTime);

    if (start === null || end === null || start >= end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "startTime must be smaller than endTime."
      });
    }
  });
