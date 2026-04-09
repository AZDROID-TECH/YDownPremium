import { Router } from "express";
import { handleDownload, handleMetadata } from "../controllers/videoController";

const videoRouter = Router();

videoRouter.post("/metadata", (request, response) => {
  void handleMetadata(request, response);
});

videoRouter.post("/download", (request, response) => {
  void handleDownload(request, response);
});

export default videoRouter;

