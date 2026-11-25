import { createApp } from "../src/server/app.js";
import { restoreApiRequestUrl } from "../src/server/vercelRouting.js";

const app = createApp();

function handler(req, res) {
  const apiUrl = restoreApiRequestUrl(req.url || "/");
  if (!apiUrl) {
    res.status(400).json({ error: "Missing or invalid API route path." });
    return;
  }
  req.url = apiUrl;
  app(req, res);
}

export {
  handler as default
};
