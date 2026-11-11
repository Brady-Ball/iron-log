import { expect, test, type Page } from '@playwright/test';
import { openScreen, planWorkout, tapLikeAFinger } from './helpers';

// A simulated user lives with one copy of the app for a whole week, as Brady does.
// A fake clock jumps between days instead of waiting; jumping forward still fires
// the app's timers that come due, the way time passing on a phone would.

const MONDAY = new Date(2026, 10, 16, 7, 0);

/** Moves the clock forward to a moment in the week, firing any timers due on the way. */
async function jumpTo(page: Page, moment: Date) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(moment.getTime() - now);
}

function at(daysAfterMonday: number, hour: number, minute = 0): Date {
  return new Date(2026, 10, 16 + daysAfterMonday, hour, minute);
}

async function startWorkout(page: Page, name: string) {
  await openScreen(page, 'Workouts');
  await page.getByRole('button', { name: `Start workout: ${name}` }).click();
}

async function logSet(page: Page, exercise: string, set: number, weight: string, reps: string) {
  await page.getByLabel(`${exercise} set ${set} weight in pounds`).fill(weight);
  await page.getByLabel(`${exercise} set ${set} reps`).fill(reps);
}

/** Finishes with one finger tap, checks which celebration plays, and closes it. */
async function finishWorkout(page: Page, celebration: string) {
  await tapLikeAFinger(page, page.getByRole('button', { name: 'Finish workout' }));
  const dialog = page.getByRole('dialog', { name: celebration });
  await expect(dialog).toBeVisible();
  await dialog.click();
}

function scheduleDay(page: Page, dayName: string) {
  return page.getByRole('button', { name: new RegExp(`^${dayName},`) });
}

test('a simulated week of workouts and food', async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await page.goto('./');
  const reminder = page.getByRole('region', { name: 'Food today' });
  const coach = page.getByRole('status', { name: 'Coach' });
  const goalWeeks = page.locator('.goal-weeks');

  await test.step('Monday 7 am: plan the week and a goal, then log breakfast', async () => {
    await planWorkout(
      page,
      'Push day',
      [
        { name: 'Chest press', sets: '2', reps: '8-10' },
        { name: 'Pec fly', sets: '2', reps: '10-12' },
      ],
      ['Monday', 'Thursday'],
    );
    await planWorkout(
      page,
      'Pull day',
      [
        { name: 'Lat pulldown', sets: '2', reps: '8-10' },
        { name: 'Hammer curls', sets: '2', reps: '10-12' },
      ],
      ['Wednesday', 'Sunday'],
    );

    await openScreen(page, 'Goals');
    await page.getByRole('button', { name: '+ New goal' }).click();
    await page.getByLabel('Lift').selectOption('Chest press');
    await page.getByLabel('Goal weight (lb)').fill('200');
    await page.getByLabel('Goal reps').fill('8');
    await page.getByLabel('Best now (lb)').fill('135');
    await page.getByLabel('Best now (reps)').fill('8');
    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(goalWeeks.locator('li.current')).toContainText('This week');
    await expect(goalWeeks).toContainText('Week of Nov 23');

    await openScreen(page, 'Workouts');
    await expect(reminder).toContainText('Nothing logged today.');
    await reminder.getByRole('button', { name: 'Log your food' }).click();
    await page.getByRole('button', { name: '+ New food' }).click();
    await page.getByLabel('Food', { exact: true }).fill('Oatmeal');
    await page.getByLabel('Calories', { exact: true }).fill('300');
    await page.getByLabel('Protein (g)').fill('10');
    await page.getByRole('button', { name: 'Save food' }).click();
    await openScreen(page, 'Workouts');
    await expect(reminder).toContainText('Today: 300 cal · 10 g protein');
  });

  // The first time a lift is logged counts as its first PR, so Monday and Wednesday play the PR celebration.
  await test.step('Monday 6 pm: push day out of order, one set skipped, one tap on Finish', async () => {
    await jumpTo(page, at(0, 18));
    await startWorkout(page, 'Push day');
    await logSet(page, 'Pec fly', 1, '40', '12');
    await expect(coach).toContainText('Next up: Pec fly, set 2 of 2');
    await logSet(page, 'Pec fly', 2, '40', '11');
    await logSet(page, 'Chest press', 1, '135', '8');
    await finishWorkout(page, 'New PR');

    await openScreen(page, 'Schedule');
    await expect(scheduleDay(page, 'Monday')).toContainText('🔥');
  });

  await test.step('Midnight with the app left open: the food reminder starts Tuesday', async () => {
    await openScreen(page, 'Workouts');
    await expect(reminder).toContainText('Today: 300 cal · 10 g protein');
    await jumpTo(page, at(0, 23, 59));
    await jumpTo(page, at(1, 0, 1));
    await expect(reminder).toContainText('Nothing logged today.');
  });

  await test.step('Wednesday: close the app mid-workout and come back an hour later', async () => {
    await jumpTo(page, at(2, 18));
    await startWorkout(page, 'Pull day');
    await logSet(page, 'Lat pulldown', 1, '120', '10');
    await page.getByLabel('Lat pulldown set 1 reps').press('Tab');
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible();

    // The phone sleeps for an hour, then Safari reloads the page.
    await page.clock.setSystemTime(at(2, 19));
    await page.reload();

    await expect(page.getByLabel('Lat pulldown set 1 weight in pounds')).toHaveValue('120');
    await expect(coach).toContainText('Next up: Lat pulldown, set 2 of 2');
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toContainText('Rest over');
    await logSet(page, 'Hammer curls', 1, '30', '12');
    await finishWorkout(page, 'New PR');
  });

  await test.step('Thursday: beat the chest press PR', async () => {
    await jumpTo(page, at(3, 18));
    await startWorkout(page, 'Push day');
    await logSet(page, 'Chest press', 1, '150', '8');
    await expect(coach).toContainText('NEW PR');
    await finishWorkout(page, 'New PR');

    await openScreen(page, 'Progress');
    await expect(page.getByRole('region', { name: 'Push day' })).toContainText('150 lb × 8');
  });

  await test.step('Sunday: finish the last scheduled workout of the week', async () => {
    await jumpTo(page, at(6, 10));
    await startWorkout(page, 'Pull day');
    await logSet(page, 'Lat pulldown', 1, '125', '10');
    await finishWorkout(page, 'Week complete');

    await openScreen(page, 'Schedule');
    await expect(page.getByText('Every workout scheduled this week is done.')).toBeVisible();
  });

  await test.step('The next Monday: a new week, history kept, and the goal moves on', async () => {
    await jumpTo(page, at(7, 8));
    await openScreen(page, 'Workouts');
    await openScreen(page, 'Schedule');
    await expect(page.getByText('Nov 23 – Nov 29')).toBeVisible();
    await expect(scheduleDay(page, 'Monday')).not.toContainText('🔥');

    await openScreen(page, 'Workouts');
    await expect(reminder).toContainText('Nothing logged today.');
    // A new week starts History empty; last week's workouts are kept on Progress.
    await expect(page.getByRole('region', { name: 'History' }).getByRole('listitem')).toHaveCount(
      0,
    );
    await openScreen(page, 'Progress');
    await expect(
      page.getByRole('region', { name: 'Older workouts' }).getByRole('listitem'),
    ).toHaveCount(4);

    await openScreen(page, 'Goals');
    // Week targets are rounded to plate steps, so two weeks can share one; check the week itself moved.
    await expect(goalWeeks.locator('li.current')).toContainText('This week');
    await expect(goalWeeks).not.toContainText('Week of Nov 23');
    await expect(goalWeeks).toContainText('Week of Nov 30');
  });
});
