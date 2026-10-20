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
    // Made from web/public/favicon.svg. macOS takes the iconset; Windows and Linux take its 1024 px PNG.
    mac: {
      icons: "assets/icon.iconset",
    },
    win: {
      icon: "assets/icon.iconset/icon_512x512@2x.png",
    },
    linux: {
      icon: "assets/icon.iconset/icon_512x512@2x.png",
    },
  },
} satisfies ElectrobunConfig;
