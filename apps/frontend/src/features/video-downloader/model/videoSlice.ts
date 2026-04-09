import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { VideoFormat, VideoQuality } from "../../../shared/types/video";

interface VideoState {
  url: string;
  selectedQuality: VideoQuality;
  selectedFormat: VideoFormat | null;
}

const initialState: VideoState = {
  url: "",
  selectedQuality: "1080p",
  selectedFormat: null
};

const videoSlice = createSlice({
  name: "video",
  initialState,
  reducers: {
    setUrl: (state, action: PayloadAction<string>) => {
      state.url = action.payload;
    },
    setSelectedQuality: (state, action: PayloadAction<VideoQuality>) => {
      state.selectedQuality = action.payload;
    },
    setSelectedFormat: (state, action: PayloadAction<VideoFormat | null>) => {
      state.selectedFormat = action.payload;
    }
  }
});

export const { setUrl, setSelectedQuality, setSelectedFormat } = videoSlice.actions;

export default videoSlice.reducer;
