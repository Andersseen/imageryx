import "@angular/compiler";
import { getTestBed } from "@angular/core/testing";
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from "@angular/platform-browser/testing";

// Zoneless TestBed bootstrap, mirroring packages/angular's setup — this workspace never ships
// zone.js (see app.config.ts's provideZonelessChangeDetection()), so component tests use the
// same model: providers configured per test, fixtures stabilized with `await fixture.whenStable()`
// rather than zone-driven auto change detection.
getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);
