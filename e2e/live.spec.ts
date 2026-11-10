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

test('the food reminder opens Nutrition and shows what was eaten', async ({ page }) => {
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

    for (const screen of ['Workouts', 'Progress', 'Schedule', 'Nutrition', 'Goals']) {
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
