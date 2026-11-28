import { expect, test } from '@playwright/test';
import { openScreen, planWorkout, tapLikeAFinger, type PlannedExercise } from './helpers';

// Each test starts in a fresh browser with nothing saved, so it never touches real data.

const pullDay: PlannedExercise[] = [
  { name: 'Lat pulldown', sets: '2', reps: '8-10' },
  { name: 'Back row', sets: '2', reps: '8-10' },
  { name: 'Hammer curls', sets: '2', reps: '10-12' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('plans a workout and keeps it after the app is reopened', async ({ page }) => {
  await planWorkout(page, 'Test day', [{ name: 'Chest press', sets: '2', reps: '8-10' }]);

  await expect(page.getByText('2 × 8–10')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Test day')).toBeVisible();
  await expect(page.getByText('2 × 8–10')).toBeVisible();
});

test('"Next up" follows an exercise done out of order', async ({ page }) => {
  await planWorkout(page, 'Pull day', pullDay);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();

  await page.getByLabel('Hammer curls set 1 weight in pounds').fill('30');
  await page.getByLabel('Hammer curls set 1 reps').fill('12');

  const coach = page.getByRole('status', { name: 'Coach' });
  await expect(coach).toContainText('Next up: Hammer curls, set 2 of 2');
  await page.reload();
  await expect(coach).toContainText('Next up: Hammer curls, set 2 of 2');
});

test('one tap on Finish, right after a set with others skipped, celebrates and adds it to History', async ({
  page,
}) => {
  await planWorkout(page, 'Pull day', pullDay);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();
  await page.getByLabel('Lat pulldown set 1 weight in pounds').fill('120');
  await page.getByLabel('Lat pulldown set 1 reps').fill('10');

  await tapLikeAFinger(page, page.getByRole('button', { name: 'Finish workout' }));
  const celebration = page.getByRole('dialog');
  await expect(celebration).toBeVisible();
  await celebration.click();

  await expect(page.getByRole('region', { name: 'History' })).toContainText('Pull day');
});

test('a workout started from far down the list opens at the top', async ({ page }) => {
  for (const name of ['Push day', 'Pull day', 'Leg day']) {
    await planWorkout(page, name, pullDay);
  }
  const start = page.getByRole('button', { name: 'Start workout: Pull day' });
  await start.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await start.click();

  await expect(page.getByRole('heading', { name: 'Pull day', level: 1 })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('the food reminder opens Food and shows what was eaten', async ({ page }) => {
  const reminder = page.getByRole('region', { name: 'Food today' });
  await expect(reminder).toContainText('Nothing logged today.');

  await reminder.getByRole('button', { name: 'Log your food' }).click();
  await page.getByRole('button', { name: '+ New food' }).click();
  await page.getByLabel('Food', { exact: true }).fill('Protein shake');
  await page.getByLabel('Calories', { exact: true }).fill('160');
  await page.getByLabel('Protein (g)').fill('30');
  await page.getByRole('button', { name: 'Save food' }).click();
  await openScreen(page, 'Workouts');

  await expect(reminder).toContainText('Today: 160 cal · 30 g protein');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every screen opens from the menu and fits the phone (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await planWorkout(page, 'Pull day', pullDay);

    for (const screen of ['Workouts', 'Progress', 'Schedule', 'Food', 'Goals']) {
      await openScreen(page, screen);
      await expect(page.getByRole('button', { name: `Menu: ${screen}` })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} scrolls sideways`).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: testInfo.outputPath(`${screen}-${colorScheme}.png`),
        fullPage: true,
      });
    }
  });
}

test('the exercise being scrolled past keeps its name in view below the top bar', async ({
  page,
}) => {
  await planWorkout(page, 'Pull day', pullDay);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();
  const bar = page.locator('.workout-bar');
  const card = page.getByRole('region', { name: 'Back row' });
  const barBottom = async () => (await bar.boundingBox())!.y + (await bar.boundingBox())!.height;

  // Jump (not the page's smooth scroll) so Back row's card is 80 px under the stuck bar.
  const barHeight = (await bar.boundingBox())!.height;
  const cardTop = await card.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await page.evaluate(
    (top) => window.scrollTo({ top, behavior: 'instant' }),
    cardTop - barHeight + 80,
  );
  expect((await card.boundingBox())!.y).toBeLessThan(await barBottom());

  const name = card.getByRole('heading', { name: 'Back row' });
  const nameBox = (await name.boundingBox())!;
  expect(nameBox.y).toBeGreaterThanOrEqual((await barBottom()) - 1);
  await expect(name).toBeInViewport();
  // While stuck it has an edge, so what slides under it reads as scrolling, not a glitch.
  await expect(name).toHaveAttribute('data-stuck', 'true');
  expect(await name.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(name).not.toHaveAttribute('data-stuck', 'true');
  expect(await name.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
});

test('tapping "Next up" brings that set into view below the top bar and its stuck name', async ({
  page,
}) => {
  // A card in the middle, since the last one can only scroll as far as the page ends.
  await planWorkout(page, 'Pull day', [
    ...pullDay,
    { name: 'Face pulls', sets: '3', reps: '12-15' },
  ]);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();
  for (const set of ['Lat pulldown set 1', 'Lat pulldown set 2', 'Back row set 1']) {
    await page.getByRole('button', { name: `Log ${set} as planned` }).click();
  }
  // Back to the top, so the last card is far below.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));

  await tapLikeAFinger(page, page.getByRole('button', { name: /Next up: Back row, set 2/ }));

  const row = page.locator('.set-row', {
    has: page.getByLabel('Back row set 2 weight in pounds'),
  });
  await expect(row).toHaveClass(/jumped/);
  await expect(row).toBeInViewport({ ratio: 1 });
  const name = page.getByRole('region', { name: 'Back row' }).getByRole('heading');
  // Wait for the smooth scroll to settle (the page stops moving), then check nothing stuck covers the row.
  let lastScroll = -1;
  await expect
    .poll(
      async () => {
        const scroll = await page.evaluate(() => window.scrollY);
        const settled = scroll === lastScroll;
        lastScroll = scroll;
        return settled;
      },
      { intervals: [200], timeout: 5000 },
    )
    .toBe(true);
  const bar = (await page.locator('.workout-bar').boundingBox())!;
  const rowTop = (await row.boundingBox())!.y;
  const nameBox = (await name.boundingBox())!;
  expect(rowTop).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(rowTop).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
  // Right below the name, with no strip of the set before it peeking out between them.
  expect(rowTop).toBeLessThanOrEqual(nameBox.y + nameBox.height + 8);
  const setBefore = page.locator('.set-row', {
    has: page.getByLabel('Back row set 1 weight in pounds'),
  });
  expect(
    (await setBefore.boundingBox())!.y + (await setBefore.boundingBox())!.height,
  ).toBeLessThanOrEqual(nameBox.y + nameBox.height);
});

test('the Exercises menu jumps to any card, just below the top bar', async ({ page }) => {
  await planWorkout(page, 'Pull day', [
    ...pullDay,
    { name: 'Face pulls', sets: '3', reps: '12-15' },
  ]);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();

  await tapLikeAFinger(page, page.getByRole('button', { name: 'Exercises' }));
  await tapLikeAFinger(page, page.getByRole('button', { name: /^Jump to Hammer curls/ }));

  await expect(page.getByRole('list', { name: 'Exercises' })).toBeHidden();
  const name = page.getByRole('region', { name: 'Hammer curls' }).getByRole('heading');
  // Wait for the smooth scroll to settle, then check the card's name sits just under the bar.
  let lastScroll = -1;
  await expect
    .poll(
      async () => {
        const scroll = await page.evaluate(() => window.scrollY);
        const settled = scroll === lastScroll;
        lastScroll = scroll;
        return settled;
      },
      { intervals: [200], timeout: 5000 },
    )
    .toBe(true);
  const bar = (await page.locator('.workout-bar').boundingBox())!;
  const nameTop = (await name.boundingBox())!.y;
  expect(nameTop).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(nameTop).toBeLessThan(bar.y + bar.height + 60);
});

test('a new workout shows Weight beside Reps, without scrolling', async ({ page }) => {
  await page.getByRole('button', { name: '+ New workout' }).click();

  const reps = page.getByLabel('Reps', { exact: true });
  const weight = page.getByLabel('Weight (lb)', { exact: true });
  // On the first iPhone SE (568 px tall) even Sets starts below the edge, so only taller phones,
  // such as the iPhone 13 the personas used, are held to "no scrolling".
  if (page.viewportSize()!.height >= 600) {
    await expect(weight).toBeInViewport({ ratio: 1 });
  }
  const repsBox = (await reps.boundingBox())!;
  const weightBox = (await weight.boundingBox())!;
  expect(Math.abs(weightBox.y - repsBox.y)).toBeLessThan(2);
  expect(weightBox.x).toBeGreaterThan(repsBox.x + repsBox.width);
});

test('starting a workout shows set 1 and its ✓ without scrolling', async ({ page }) => {
  await planWorkout(page, 'Pull day', pullDay);
  await page.getByRole('button', { name: 'Start workout: Pull day' }).click();

  await expect(
    page.getByRole('button', { name: 'Log Lat pulldown set 1 as planned' }),
  ).toBeInViewport({ ratio: 1 });
  // The instructions start folded, one tap away.
  const howTo = page.getByText('How logging works');
  await expect(page.getByText(/Grey numbers are the plan/)).toBeHidden();
  await howTo.click();
  await expect(page.getByText(/Grey numbers are the plan/)).toBeVisible();
});

test('what is left of a food goal reads as large and dark as the total', async ({ page }) => {
  await openScreen(page, 'Food');
  await page.getByRole('button', { name: 'Add daily goals (optional)' }).click();
  await page.getByLabel('Protein goal (g)').fill('160');
  await page.getByRole('button', { name: 'Save goals' }).click();

  const totals = page.getByRole('region', { name: "Today's totals" });
  const left = totals.getByText('160 g left');
  const total = totals.getByText('0 / 160 g');
  const style = (locator: typeof left) =>
    locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { size: computed.fontSize, color: computed.color };
    });
  const leftStyle = await style(left);
  const totalStyle = await style(total);
  expect(leftStyle.size).toBe(totalStyle.size);
  expect(leftStyle.color).toBe(totalStyle.color);
});
