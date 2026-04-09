import app from "./app";
import { startAutoPingScheduler } from "./services/autoPingService";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // Server başlanğıc qeydidir.
  console.log(`Backend API is running on port ${String(port)}`);
  startAutoPingScheduler();
});
