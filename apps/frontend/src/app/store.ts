import { configureStore } from "@reduxjs/toolkit";
import { videoApi } from "../shared/api/videoApi";
import videoReducer from "../features/video-downloader/model/videoSlice";

export const store = configureStore({
  reducer: {
    video: videoReducer,
    [videoApi.reducerPath]: videoApi.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(videoApi.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

