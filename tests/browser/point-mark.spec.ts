import { expect, test } from "@playwright/test";

test("the original Points coin has 3D depth and continuous randomized motion that pauses when hidden", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: null }));
  await page.goto("/cuenta");
  const mark = page.locator(".xp-access__story .xp-mark");
  await expect(mark.locator("img")).toHaveCount(19);
  for (const image of await mark.locator("img").all()) {
    await expect(image).toHaveAttribute(
      "src",
      "/images/logo%20sin%20fondo.webp",
    );
  }
  const face = mark.locator(".xp-mark__face");
  await expect
    .poll(() =>
      face.evaluate(
        (image) =>
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth >= 512,
      ),
    )
    .toBe(true);
  await expect(face).toHaveCSS("filter", "none");
  expect(
    await face.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).m43,
    ),
  ).toBe(28);
  const body = mark.locator(".xp-mark__body");
  await expect(body).toHaveCSS("animation-name", "none");
  await expect(mark).toHaveCSS("perspective", "560px");
  await expect(body).toHaveCSS("transform-style", "preserve-3d");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".impeccable/review/logo-3d-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/logo-3d-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() =>
      body.evaluate((element) => element.getAnimations()[0]?.playState),
    )
    .toBe("running");
  // Each bounded segment must generate another, rather than repeat fixed keyframes.
  expect(
    await body.evaluate(
      (element) => element.getAnimations()[0].effect?.getTiming().iterations,
    ),
  ).toBe(1);
  const segments = await body.evaluate(async (element) => {
    const result: { start: string; end: string; duration: number }[] = [];
    for (let index = 0; index < 4; index++) {
      const animation = element.getAnimations()[0];
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect))
        throw new Error("Missing coin keyframes");
      const frames = effect.getKeyframes();
      result.push({
        start: String(frames[0].transform),
        end: String(frames.at(-1)?.transform),
        duration: Number(effect.getTiming().duration),
      });
      const finished = new Promise<void>((resolve) =>
        animation.addEventListener("finish", () => resolve(), { once: true }),
      );
      animation.finish();
      await finished;
    }
    return result;
  });
  for (const [index, segment] of segments.entries()) {
    expect(segment.start).not.toBe(segment.end);
    expect(segment.duration).toBeGreaterThanOrEqual(3200);
    expect(segment.duration).toBeLessThanOrEqual(5200);
    if (index > 0) expect(segment.start).toBe(segments[index - 1].end);
  }
  expect(new Set(segments.map((segment) => segment.end)).size).toBe(4);
  expect(
    new Set(segments.map((segment) => segment.duration)).size,
  ).toBeGreaterThan(1);
  expect(
    await body.evaluate(
      (element) => !new DOMMatrix(getComputedStyle(element).transform).is2D,
    ),
  ).toBe(true);
  // A short viewport lets the complete mark scroll out of view.
  await page.setViewportSize({ width: 390, height: 600 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() =>
      body.evaluate((element) => element.getAnimations()[0]?.playState),
    )
    .toBe("paused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      body.evaluate((element) => element.getAnimations()[0]?.playState),
    )
    .toBe("running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => body.evaluate((element) => element.getAnimations().length))
    .toBe(0);
  expect(
    await body.evaluate(
      (element) => !new DOMMatrix(getComputedStyle(element).transform).is2D,
    ),
  ).toBe(true);
});
