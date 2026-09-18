import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExpectedLabitconfReward,
  type LabitconfReward,
} from '../scripts/import-labitconf-tickets.js';

const expectedReward: LabitconfReward = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Entrada a LaBitConf',
  cost: 150,
  active: false,
};

test('LaBitConf importer only accepts the exact inactive 150-point reward', () => {
  assert.doesNotThrow(() => assertExpectedLabitconfReward(expectedReward));

  const invalidRewards: Array<[string, LabitconfReward, RegExp]> = [
    ['different title', { ...expectedReward, title: 'Entrada LaBitConf' }, /debe ser exactamente/],
    ['different casing', { ...expectedReward, title: 'Entrada a LABITCONF' }, /debe ser exactamente/],
    ['title with whitespace', { ...expectedReward, title: 'Entrada a LaBitConf ' }, /debe ser exactamente/],
    ['different cost', { ...expectedReward, cost: 149 }, /costar 150 Points/],
    ['active reward', { ...expectedReward, active: true }, /Desactivá la recompensa/],
    [
      'invalid active state',
      { ...expectedReward, active: null as unknown as boolean },
      /Desactivá la recompensa/,
    ],
  ];

  for (const [scenario, reward, expectedError] of invalidRewards) {
    assert.throws(
      () => assertExpectedLabitconfReward(reward),
      expectedError,
      scenario,
    );
  }
});
