const VERCEL_API_PATH_PARAM = "__vercelApiPath";

function restoreApiRequestUrl(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const apiPaths = url.searchParams.getAll(VERCEL_API_PATH_PARAM);
  if (apiPaths.length !== 1 || !apiPaths[0]) return null;

  const apiPath = apiPaths[0].replace(/^\/+/, "");
  url.searchParams.delete(VERCEL_API_PATH_PARAM);
  const query = url.searchParams.toString();
  return `/api/${apiPath}${query ? `?${query}` : ""}`;
}

export {
  restoreApiRequestUrl
};
