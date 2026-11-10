import type { Locator, Page } from '@playwright/test';

export interface PlannedExercise {
  name: string;
  sets: string;
  reps: string;
}

/** Plans a workout in the editor, on the given days of the week (none for no set day). */
export async function planWorkout(
  page: Page,
  name: string,
  exercises: PlannedExercise[],
  days: string[] = [],
) {
  await page.getByRole('button', { name: '+ New workout' }).click();
  await page.getByLabel('Workout name').fill(name);
  for (const day of days) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  for (const [index, exercise] of exercises.entries()) {
    if (index > 0) {
      await page.getByRole('button', { name: '+ Add exercise' }).click();
    }
    await page.getByLabel('Name', { exact: true }).nth(index).fill(exercise.name);
    await page.getByLabel('Sets', { exact: true }).nth(index).fill(exercise.sets);
    await page.getByLabel('Reps', { exact: true }).nth(index).fill(exercise.reps);
  }
  await page.getByRole('button', { name: 'Save workout' }).click();
}

/** Presses down, pauses, and lifts, like a finger, so the page can move mid-tap as it would on a phone. */
export async function tapLikeAFinger(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error('Nothing to tap: the target is not on screen');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
}

export async function openScreen(page: Page, name: string) {
  await page.getByRole('button', { name: /^Menu/ }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
