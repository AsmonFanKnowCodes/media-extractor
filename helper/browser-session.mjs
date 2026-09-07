export const LOGIN_BROWSERS = ["brave", "chrome", "edge"];
export function cookieArgs(enabled, browser = "brave") {
  if (!enabled) return [];
  if (!LOGIN_BROWSERS.includes(browser))
    throw new Error("Choose Brave, Chrome or Edge as the login browser.");
  return ["--cookies-from-browser", browser];
}
