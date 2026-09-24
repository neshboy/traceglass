#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Command } from "commander";
import { renderTraceToHtml } from "./index.js";
import { UnknownTraceFormatError } from "./parsers/detect.js";

const program = new Command();

program
  .name("traceglass")
  .description("Render AI-agent execution traces (MCP JSON-RPC logs or generic span arrays) as a standalone HTML waterfall.")
  .version("0.1.0");

program
  .command("render")
  .description("Render a trace JSON file to a standalone HTML waterfall viewer")
  .argument("<input>", "path to the trace JSON file")
  .option("-o, --output <file>", "output HTML file path", "waterfall.html")
  .option("-t, --title <title>", "title shown in the generated page")
  .action((input: string, opts: { output: string; title?: string }) => {
    const inputPath = resolve(process.cwd(), input);
    let raw: unknown;
    try {
      const contents = readFileSync(inputPath, "utf-8");
      raw = JSON.parse(contents);
    } catch (err) {
      console.error(`traceglass: failed to read/parse "${inputPath}": ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    try {
      const html = renderTraceToHtml(raw, {
        title: opts.title ?? basename(inputPath),
        sourceFile: inputPath,
      });
      const outputPath = resolve(process.cwd(), opts.output);
      writeFileSync(outputPath, html, "utf-8");
      console.log(`traceglass: wrote ${outputPath}`);
    } catch (err) {
      if (err instanceof UnknownTraceFormatError) {
        console.error(`traceglass: ${err.message}`);
      } else {
        console.error(`traceglass: failed to render trace: ${(err as Error).message}`);
      }
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
