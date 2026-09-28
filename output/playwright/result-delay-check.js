async (page) => {
  const started = Date.now();
  await page.evaluate(() => window.qaResultAction('finish'));
  await page.waitForTimeout(1000);
  if (await page.locator('#result').isVisible()) throw new Error('Result interrupted the final shot');
  await page.screenshot({path:'output/playwright/final-play-before-result.png'});
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.qaResultAction('repeat'));
  await page.waitForTimeout(3000);
  if (await page.locator('#result').isVisible()) throw new Error('Result appeared before animation + 5 seconds');
  await page.locator('#result').waitFor({state:'visible',timeout:4000});
  const elapsed = Date.now() - started;
  if (elapsed < 6300 || elapsed > 8200) throw new Error(`Unexpected reveal time: ${elapsed}`);
  await page.screenshot({path:'output/playwright/final-play-result.png'});
  console.log(JSON.stringify({finalShotAndDelayMs:elapsed,duplicateFinishedStateDidNotResetDelay:true}));
  await page.evaluate(() => window.qaResultAction('lobby'));
  await page.evaluate(() => window.qaResultAction('finish'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.qaResultAction('lobby'));
  await page.waitForTimeout(6500);
  if (await page.locator('#result').isVisible()) throw new Error('A cancelled result timer reopened in lobby');
  console.log('Returning to lobby cancels the pending result popup.');
}
