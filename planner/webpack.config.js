const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const root = path.resolve(__dirname, "..");

module.exports = (env, argv) => ({
  context: root,
  entry: { hub: "./planner/src/hub/index.tsx" },
  output: { path: path.resolve(__dirname, "dist"), filename: "[name]/index.js", chunkFilename: "chunks/[name].[contenthash:8].js", publicPath: "auto", clean: true },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    // one copy of the SDK (see ../webpack.config.js)
    alias: { "azure-devops-extension-sdk$": path.resolve(root, "node_modules/azure-devops-extension-sdk/esm/SDK.js") },
  },
  devtool: argv.mode === "production" ? false : "inline-source-map",
  module: { rules: [
    { test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/, options: { compilerOptions: { noEmit: false } } },
    { test: /\.css$/, use: ["style-loader", "css-loader"] },
  ] },
  plugins: [new HtmlWebpackPlugin({ template: "./planner/src/hub/index.html", filename: "hub/index.html", chunks: ["hub"], scriptLoading: "defer", inject: "head" })],
  performance: { hints: false },
  stats: "errors-warnings",
});
