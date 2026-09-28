# Final play and ambient background QA

- Production build passed.
- Browser transport fixture supplied a final shot, finished state and result summary to the real client. No server state was mutated.
- Popup remained hidden during the shot and at 5.1 seconds after receipt; became visible within 6.3–8.2 seconds, covering the 1.36-second shot effect followed by the 5-second delay.
- Repeated finished state did not restart the countdown.
- Returning to lobby while waiting cancelled the pending popup; it remained hidden after 6.5 additional seconds.
- Screenshots inspected at 844 × 390 and 1920 × 900. At the wide viewport the battlefield canvas remained 1600 × 900, centered at x=160, and the ambient map artwork filled both 160-pixel side gaps.

CLI fixture: run `result-delay-setup.js` through Playwright CLI on the local game, enter practice through the UI if no session is active, then run `result-delay-check.js`. Use a fresh browser session for each run.

Screenshots: `ambient-phone.png`, `ambient-wide.png`, `final-play-before-result.png`, `final-play-result.png`.
