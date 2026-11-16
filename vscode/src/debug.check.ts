// Self-check for the pure DAP helpers: `npm run compile && node out/debug.check.js`
import * as assert from 'assert';
import { parentOf, treeToJson, Var } from './dap';

assert.strictEqual(parentOf('a.b[0].c'), 'a.b[0]');
assert.strictEqual(parentOf('a.b['), 'a.b');
assert.strictEqual(parentOf('a'), '');

const tree: Record<number, Var[]> = {
  1: [{ name: 'name', value: '"Tam"', ref: 0 }, { name: 'tags', value: 'Array(2)', ref: 2 }, { name: '[[Prototype]]', value: 'Object', ref: 9 }],
  2: [{ name: '0', value: '"a"', ref: 0 }, { name: '1', value: '"b"', ref: 0 }, { name: 'length', value: '2', ref: 0 }],
};
treeToJson({ name: 'user', value: 'Object', ref: 1 }, async (r) => tree[r] ?? []).then((j) => {
  assert.deepStrictEqual(j, { name: 'Tam', tags: ['a', 'b'] });
  console.log('debug.check: ok');
});
