import { createApp } from "../src/server/app.js";
const app = createApp();
function handler(req, res) {
  app(req, res);
}
export {
  handler as default
};
