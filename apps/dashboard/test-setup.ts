import "@angular/compiler";
import { getTestBed } from "@angular/core/testing";
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from "@angular/platform-browser/testing";

// jsdom implements no Web Animations API at all — `Element.prototype.getAnimations` does not
// exist. ng-primitives' overlay (behind Volt's dropdown menu, popover and dialog) calls it while
// tearing down its exit animation, so closing any of those in a test throws inside a `setTimeout`
// callback that fires *after* the test — an unhandled rejection vitest reports as a failed run
// even though every assertion passed. A no-animations answer is exactly correct for jsdom, which
// never runs a real animation regardless: this doesn't paper over missing coverage, it supplies
// the answer jsdom itself has no way to give.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

// Zoneless TestBed bootstrap, mirroring packages/angular's setup — this workspace never ships
// zone.js (see app.config.ts's provideZonelessChangeDetection()), so component tests use the
// same model: providers configured per test, fixtures stabilized with `await fixture.whenStable()`
// rather than zone-driven auto change detection.
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);
