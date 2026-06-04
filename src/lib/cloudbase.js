import cloudbase from "@cloudbase/js-sdk";

// 统一使用固定的云开发环境 ID
const ENV_ID = "cloud1-d2gpq0fat0dd3c17f";
// 自动修正可能被污染的本地 localStorage 缓存
if (localStorage.getItem("CLOUDBASE_ENV_ID") !== ENV_ID) {
  localStorage.setItem("CLOUDBASE_ENV_ID", ENV_ID);
}

const app = cloudbase.init({
  env: ENV_ID,
});

const auth = app.auth({
  persistence: "local",
});

export { app, auth, ENV_ID };
export default app;
