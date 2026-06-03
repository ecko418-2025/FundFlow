import cloudbase from "@cloudbase/js-sdk";

// 从 localStorage 或默认占位符获取云开发环境 ID
const ENV_ID = localStorage.getItem("CLOUDBASE_ENV_ID") || "cloud1-d2gpq0fat0dd3c17f";

const app = cloudbase.init({
  env: ENV_ID,
});

const auth = app.auth({
  persistence: "local",
});

export { app, auth, ENV_ID };
export default app;
