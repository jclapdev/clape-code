import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Control Center",
    identifier: "local.control-center",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    // The built web app (bun run build), served by the server from inside the app.
    copy: {
      "web/dist": "web",
    },
  },
} satisfies ElectrobunConfig;
