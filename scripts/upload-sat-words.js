#!/usr/bin/env node
/**
 * Upload SAT vocabulary words into the "Common SAT Words" sub-sets.
 *
 * Usage: Run from the app directory after starting the dev server.
 *   node scripts/upload-sat-words.js
 *
 * This script:
 * 1. Reads the CSV vocabulary data
 * 2. Parses it into flashcard entries (front = word, back = definition + example)
 * 3. Shuffles randomly
 * 4. Distributes across the 10 "Common SAT Words" sub-sets
 * 5. Uses the bulk-import API to insert them
 *
 * Requirements: SUPABASE_URL, SUPABASE_ANON_KEY env vars (from .env.local)
 * And a valid user session. This script uses the Supabase JS client directly.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CSV with proper handling of quoted fields
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  // Parse each line into fields
  return lines.map(line => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  // Read CSV
  const csvPath = path.join(__dirname, 'sat-vocabulary.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');

  const rows = parseCSV(csvText);

  // Skip header row
  const header = rows[0];
  console.log('Header:', header);

  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const [word, definition, example] = rows[i];
    if (!word || !word.trim()) continue;

    const front = `**${word.trim()}**`;
    let back = definition ? definition.trim() : '';
    if (example && example.trim()) {
      back += `\n\n*${example.trim()}*`;
    }
    if (back) {
      entries.push({ front, back });
    }
  }

  console.log(`Parsed ${entries.length} vocabulary words`);

  // Shuffle
  const shuffled = shuffle(entries);

  // Find a user who has the "Common SAT Words" set
  const { data: parentSets, error: psErr } = await supabase
    .from('flashcard_sets')
    .select('id, user_id, name, parent_set_id')
    .eq('name', 'Common SAT Words')
    .is('parent_set_id', null);

  if (psErr) {
    console.error('Error finding parent sets:', psErr.message);
    process.exit(1);
  }

  if (!parentSets || parentSets.length === 0) {
    console.error('No "Common SAT Words" parent sets found. Make sure a user has visited the flashcards tab first.');
    process.exit(1);
  }

  console.log(`Found ${parentSets.length} user(s) with "Common SAT Words" parent set`);

  for (const parent of parentSets) {
    console.log(`\nProcessing user ${parent.user_id}...`);

    // Find child sets
    const { data: children, error: chErr } = await supabase
      .from('flashcard_sets')
      .select('id, name')
      .eq('parent_set_id', parent.id)
      .order('name', { ascending: true });

    if (chErr) {
      console.error('Error finding child sets:', chErr.message);
      continue;
    }

    if (!children || children.length === 0) {
      console.error('No child sets found for this parent. Skipping.');
      continue;
    }

    console.log(`Found ${children.length} sub-sets`);

    // Check if cards already exist in sub-sets
    const childIds = children.map(c => c.id);
    const { count: existingCount } = await supabase
      .from('flashcards')
      .select('id', { count: 'exact', head: true })
      .in('set_id', childIds);

    if (existingCount > 0) {
      console.log(`Sub-sets already contain ${existingCount} cards. Skipping to avoid duplicates.`);
      continue;
    }

    // Distribute shuffled words across sub-sets
    const subsetCount = children.length;
    const perSet = Math.ceil(shuffled.length / subsetCount);

    for (let i = 0; i < subsetCount; i++) {
      const subset = children[i];
      const start = i * perSet;
      const end = Math.min(start + perSet, shuffled.length);
      const cards = shuffled.slice(start, end);

      if (cards.length === 0) continue;

      // Insert cards
      const rows = cards.map(c => ({
        set_id: subset.id,
        front: c.front,
        back: c.back,
      }));

      const { error: insErr } = await supabase.from('flashcards').insert(rows);
      if (insErr) {
        console.error(`Error inserting into ${subset.name}:`, insErr.message);
      } else {
        console.log(`  ${subset.name}: ${cards.length} cards inserted`);
      }
    }

    console.log(`Done! Total ${shuffled.length} cards distributed across ${subsetCount} sub-sets.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
