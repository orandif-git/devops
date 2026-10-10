const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const pages = ["grid", "dropdown", "observer", "hub", "capacity", "readonly"];

module.exports = (env, argv) => ({
  entry: Object.fromEntries(pages.map(p => [p, `./src/${p}/index.${p === "observer" ? "ts" : "tsx"}`])),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name]/index.js",
    chunkFilename: "chunks/[name].[contenthash:8].js",
    publicPath: "auto",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    // The SDK ships ESM and AMD builds. Our code imports the ESM one and azure-devops-extension-api (AMD) asks for the
    // AMD one, so the page ended up with TWO copies; the copy that never ran init() makes every REST call hang forever.
    // Force a single copy for everyone.
    alias: { "azure-devops-extension-sdk$": path.resolve(__dirname, "node_modules/azure-devops-extension-sdk/esm/SDK.js") },
  },
  devtool: argv.mode === "production" ? false : "inline-source-map",
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/, options: { compilerOptions: { noEmit: false } } },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: pages.map(p => new HtmlWebpackPlugin({ template: `./src/${p}/index.html`, filename: `${p}/index.html`, chunks: [p], scriptLoading: "defer", inject: "head" })),
  performance: { hints: false },
  stats: "errors-warnings",
});
