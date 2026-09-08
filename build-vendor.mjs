/* Refresh dist/vendor/. Run after bumping either dependency; the output is committed
   so the journey itself still needs no install step to run. */
import { build } from "esbuild";
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
copyFileSync(require.resolve("@creditnirvana/cobrowse/global"), "dist/vendor/cobrowse.js");

await build({
  entryPoints: ["vendor-src/sarvam-entry.js"],
  bundle: true, format: "iife", target: ["es2020"], minify: true, sourcemap: false,
  legalComments: "none", outfile: "dist/vendor/sarvam.js", logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
});
