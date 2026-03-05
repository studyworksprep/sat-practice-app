#!/usr/bin/env node

/**
 * Generate graph PNGs from graphs.json using Puppeteer + Desmos API.
 *
 * Usage:
 *   node scripts/generate-graphs.js
 *
 * Environment variables:
 *   SUPABASE_URL           – your Supabase project URL
 *   SUPABASE_SERVICE_KEY   – service-role key (for Storage uploads)
 *   STORAGE_BUCKET         – bucket name (default: "graphs")
 *
 * Each entry in graphs.json produces a PNG uploaded to
 *   <bucket>/<id>.png
 *
 * After all uploads, a manifest (graphs-manifest.json) is written to
 * the repo so the app can look up public URLs.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const GRAPHS_PATH = path.join(__dirname, '..', 'graphs.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'graphs-manifest.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'graphs');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'graphs';

const useSupabase = SUPABASE_URL && SUPABASE_SERVICE_KEY;

async function uploadToSupabase(filePath, remotePath) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const fileBuffer = fs.readFileSync(filePath);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(remotePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed for ${remotePath}: ${error.message}`);

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(remotePath);
  return data.publicUrl;
}

/**
 * Build a minimal HTML page that loads Desmos, sets expressions,
 * and waits for the graph to render.
 */
function buildDesmosHtml(graph) {
  const expressions = graph.expressions
    .map((expr, i) => `calculator.setExpression({ id: 'expr${i}', latex: '${expr}' });`)
    .join('\n');

  const [xMin, xMax] = graph.xRange || [-10, 10];
  const [yMin, yMax] = graph.yRange || [-10, 10];

  return `<!DOCTYPE html>
<html>
<head>
  <script src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"></script>
  <style>
    * { margin: 0; padding: 0; }
    #calculator { width: ${graph.width || 600}px; height: ${graph.height || 400}px; }
  </style>
</head>
<body>
  <div id="calculator"></div>
  <script>
    var elt = document.getElementById('calculator');
    var calculator = Desmos.GraphingCalculator(elt, {
      expressions: false,
      settingsMenu: false,
      zoomButtons: false,
      lockViewport: true
    });

    calculator.setMathBounds({
      left: ${xMin}, right: ${xMax},
      bottom: ${yMin}, top: ${yMax}
    });

    ${expressions}

    // Signal ready after a short delay for rendering
    setTimeout(function() {
      document.title = 'ready';
    }, 2000);
  </script>
</body>
</html>`;
}

async function generateGraph(browser, graph) {
  const page = await browser.newPage();
  await page.setViewport({
    width: graph.width || 600,
    height: graph.height || 400,
    deviceScaleFactor: 2,
  });

  const html = buildDesmosHtml(graph);
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Wait for Desmos to finish rendering
  await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });

  // Take screenshot of just the calculator div
  const element = await page.$('#calculator');
  const outputPath = path.join(OUTPUT_DIR, `${graph.id}.png`);
  await element.screenshot({ path: outputPath, type: 'png' });

  await page.close();
  console.log(`  Generated: ${graph.id}.png`);
  return outputPath;
}

async function main() {
  if (!fs.existsSync(GRAPHS_PATH)) {
    console.error('graphs.json not found');
    process.exit(1);
  }

  const graphs = JSON.parse(fs.readFileSync(GRAPHS_PATH, 'utf8'));
  console.log(`Found ${graphs.length} graph(s) to generate.\n`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const manifest = {};

  for (const graph of graphs) {
    try {
      const filePath = await generateGraph(browser, graph);

      if (useSupabase) {
        const publicUrl = await uploadToSupabase(filePath, `${graph.id}.png`);
        manifest[graph.id] = publicUrl;
        console.log(`  Uploaded: ${publicUrl}`);
      } else {
        // Local-only mode: reference the public path
        manifest[graph.id] = `/graphs/${graph.id}.png`;
        console.log(`  Local path: /graphs/${graph.id}.png`);
      }
    } catch (err) {
      console.error(`  ERROR generating ${graph.id}:`, err.message);
      process.exit(1);
    }
  }

  await browser.close();

  // Write manifest so the app can look up URLs
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nManifest written to public/graphs-manifest.json`);

  if (!useSupabase) {
    console.log('\nNote: No SUPABASE_URL / SUPABASE_SERVICE_KEY set.');
    console.log('Graphs saved locally to public/graphs/. Set env vars to upload to Supabase Storage.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
