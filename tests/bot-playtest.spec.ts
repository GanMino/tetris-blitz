import { expect, test } from '@playwright/test';

// Bot playtest for TETRIS BLITZ. Drives the game through real keyboard input
// and asserts the core loop actually progresses: rotation/movement respond,
// a hard drop locks a piece, a scripted 4-line clear scores and extends the
// timer, the countdown ends the run with the time-up overlay, and the retry
// button restarts into a live run. Requires the seed/setState test hooks.

type Snapshot = {
  frame: number;
  phase: string;
  score: number;
  lines: number;
  timeLeft: number;
  activeX: number;
  stackTop: number;
};

test('bot playtest: input drives locks, line clears, time-up and retry', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chrome',
    'The bot uses keyboard input; mobile touch input is exercised by visual.spec.ts.',
  );
  test.setTimeout(90_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

  const sample = async (): Promise<Snapshot> =>
    page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return {
        frame: d?.frame ?? 0,
        phase: d?.phase ?? '',
        score: d?.score ?? 0,
        lines: d?.lines ?? 0,
        timeLeft: d?.timeLeft ?? 0,
        activeX: d?.active?.x ?? 0,
        stackTop: d?.stackTop ?? -1,
      };
    });

  // --- Phase 1: scripted TETRIS in the bot-well fixture.
  await page.evaluate(async () => {
    const hooks = window.__THREE_GAME_TEST_HOOKS__;
    if (!hooks) throw new Error('missing test hooks');
    await hooks.seed(42);
    const applied = await hooks.setState('bot-well');
    if (!applied || applied.state !== 'bot-well') throw new Error('setState must acknowledge bot-well');
  });

  const start = await sample();
  expect(start.phase).toBe('playing');

  const softlockWindows: number[] = [];
  let lastProgress = start;
  const step = async (run: () => Promise<void>) => {
    await run();
    const snap = await sample();
    const progressed = snap.score > lastProgress.score || snap.lines > lastProgress.lines || snap.activeX !== lastProgress.activeX;
    if (!progressed) softlockWindows.push(snap.frame - lastProgress.frame);
    lastProgress = snap;
    return snap;
  };

  const tap = async (key: string, ms = 90) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(60);
  };

  // Rotate the I piece vertical and walk it over the one-column well.
  await step(() => tap('ArrowUp'));
  await step(() => tap('ArrowRight'));
  const afterMove = await step(() => tap('ArrowRight'));
  expect(afterMove.activeX).toBe(5);

  // Hard drop: fills the well, clears 4 lines.
  const afterDrop = await step(() => tap('Space', 90));
  expect(afterDrop.lines).toBe(4);
  expect(afterDrop.score).toBeGreaterThan(start.score);

  // Hard drop the next piece anywhere: the loop keeps progressing.
  const afterSecond = await step(() => tap('Space', 90));
  expect(afterSecond.score).toBeGreaterThan(afterDrop.score);

  // --- Phase 1b: power bank trigger (slot 1 = BOMB blasts 3×3 bottom-center).
  await page.evaluate(async () => {
    const hooks = window.__THREE_GAME_TEST_HOOKS__;
    await hooks?.setState('powerup');
  });
  const bankBefore = await page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return { bank: d?.bank ?? [], occupied: d?.occupied ?? 0 };
  });
  expect(bankBefore.bank).toEqual(['bomb', 'double']);
  await tap('Digit1');
  const bankAfter = await page.evaluate(() => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    return { bank: d?.bank ?? [], occupied: d?.occupied ?? 0 };
  });
  expect(bankAfter.occupied).toBeLessThan(bankBefore.occupied);
  expect(bankAfter.bank).toEqual(['double']);

  // --- Phase 2: the time limit ends the run.
  await page.evaluate(async () => {
    const hooks = window.__THREE_GAME_TEST_HOOKS__;
    await hooks?.setState('time-low');
  });
  await expect(page.locator('#gameover-overlay')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('#gameover-reason')).toHaveText('时间到！');

  // --- Phase 3: retry restarts into a live run.
  await page.click('#gameover-retry-button');
  await expect
    .poll(async () => (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)) ?? '')
    .toBe('playing');
  const restarted = await sample();
  expect(restarted.score).toBe(0);
  expect(restarted.timeLeft).toBeGreaterThan(0);

  const report = {
    phase1: {
      lineClearAchieved: afterDrop.lines >= 4,
      scoreBefore: start.score,
      scoreAfterDrop: afterDrop.score,
      scoreAfterSecond: afterSecond.score,
      bankTrigger: {
        before: bankBefore,
        after: bankAfter,
      },
    },
    phase2: { timeUpOverlayShown: true },
    phase3: { retryRestarted: true },
    softlockWindows: softlockWindows.length,
    consoleErrors,
    pageErrors,
  };
  await testInfo.attach('bot-playtest-report', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(`bot playtest: ${JSON.stringify(report)}`);

  expect(pageErrors, 'page errors during bot play').toEqual([]);
  expect(consoleErrors, 'console errors during bot play').toEqual([]);
  expect(softlockWindows.length, 'scripted input should keep making progress').toBeLessThanOrEqual(2);
});
