import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import videoRouter from "./routes/videoRoutes";
import { markAutoPingActivity } from "./services/autoPingService";

const app = express();

app.use(
  cors({
    origin: true
  })
);
app.use(express.json({ limit: "32kb" }));
app.use((request: Request, _response: Response, next: NextFunction) => {
  markAutoPingActivity(request);
  next();
});

app.get("/api/health", (_request: Request, response: Response) => {
  response.status(200).json({ status: "ok" });
});

app.use("/api/videos", videoRouter);

app.use(
  (
    error: Error,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    response.status(500).json({
      message: error.message
    });
  }
);

export default app;
