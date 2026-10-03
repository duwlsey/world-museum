const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const filename = 'src/bookSources.ts';
const javascript = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(javascript, { exports: exportsObject, require: (name) => {
  if (name === './bookAssets.json') return JSON.parse(fs.readFileSync('src/bookAssets.json', 'utf8'));
  throw new Error('Unexpected import: ' + name);
}, document: {}, setTimeout, clearTimeout });
const { bookSpreads, cachePageSource, bookPreviewUrl } = exportsObject;
(async () => {
  for (let count = 1; count <= 61; count++) {
    const spreads = JSON.parse(JSON.stringify(bookSpreads(count)));
    assert.deepEqual(spreads.flat(), Array.from({length: count}, (_, index) => index + 1));
    assert.deepEqual(spreads[0], [1]);
    if (count > 1) assert.deepEqual(spreads.at(-1), [count]);
    assert(spreads.every((spread) => spread.length <= 2));
  }
  assert.equal(bookSpreads(0).length, 0);
  let calls = 0;
  const source = cachePageSource({key: 'test', numPages: 20, render: async (number, width) => { calls++; return {number, width}; }});
  const a = source.render(1, 960);
  assert.equal(a, source.render(1, 960), 'Concurrent requests must share work');
  await a;
  await source.render(1, 640);
  assert.equal(calls, 2, 'A new width must produce a new canvas');
  for (let number = 2; number <= 14; number++) await source.render(number, 960);
  await source.render(1, 960);
  assert.equal(calls, 16, 'Old pages must be evicted');
  let attempt = 0;
  const retry = cachePageSource({ key:'retry',numPages:1, render:async()=> { if (++attempt === 1) throw new Error('offline'); return {}; } });
  await assert.rejects(retry.render(1, 960));
  await retry.render(1, 960);
  assert.equal(attempt, 2, 'Failed renders must be retryable');
  assert.equal(bookPreviewUrl('/custom.pdf'), undefined);
  const assets = JSON.parse(fs.readFileSync('src/bookAssets.json','utf8'));
  for (const asset of Object.values(assets)) {
    assert.equal(asset.numPages, 30);
    assert(fs.existsSync('public' + asset.base + '/cover.webp'));
    for (let page=1;page<=asset.numPages;page++) assert(fs.existsSync('public' + asset.base + '/' + page + '.webp'));
  }
  console.log('Passed: page order and covers (1–61 pages), shared rendering, adaptive width, bounded cache, retry, all 90 assets.');
})().catch(error => { console.error(error); process.exitCode=1; });
