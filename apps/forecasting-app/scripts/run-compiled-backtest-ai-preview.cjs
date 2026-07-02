const Module = require("node:module");
const path = require("node:path");

const compiledRoot = path.resolve(__dirname, "../.tmp/ai-preview-backtest");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(compiledRoot, "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require(path.join(compiledRoot, "scripts/backtest-ai-preview.js"));
