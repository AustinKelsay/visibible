import { defineApp } from "convex/server";
import neutralCost from "neutral-cost/convex.config";

const app = defineApp();

app.use(neutralCost);

export default app;
