const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
  logLevel: "info",
  // esbuild's CJS output leaves `import.meta.url` undefined, but a bundled
  // dependency (the Agent SDK's HTTP stack) calls createRequire(import.meta.url)
  // purely to require() Node built-ins — any valid file URL works as the base.
  define: {
    "import.meta.url": "specguardImportMetaUrl",
  },
  banner: {
    js: "const specguardImportMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("watching...");
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
