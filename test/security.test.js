import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('strict CSP is the first thing in <head>, and nothing loads from another origin', () => {
  const html = read('index.html');
  assert.match(html, /<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; [^"]*require-trusted-types-for 'script'/);
  assert.doesNotMatch(html + read('style.css'), /(src|href)="(https?:)?\/\/|url\(|<script>|<style>|style="/);
});
