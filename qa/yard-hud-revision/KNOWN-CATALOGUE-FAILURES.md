# Existing catalogue checks: reproduced and corrected

These are not release waivers. Both failures reproduce on the untouched worktree at commit `4660ba9d84a0abb40f7c77bed7a702caba18b67b` with `node --test tests/yard-catalog-ui.test.mjs`. The complete baseline log is retained in the private integration checkpoint. The narrow corrections below are included in this revision.

1. `album metadata selects the saved visitor pose, goodie and remodel without mutating the photo`
   - Expected background URL: `/games/companion-yard/backgrounds/moon_garden.png`.
   - Actual URL: `/assets/yard-ui/delivery/background-moon_garden.webp`.
   - Classification: stale expected delivery path in the test. Existing `catalogPreview()` deliberately maps remodels to the delivery WebP; the saved remodel ID still determines the same background. This failure is independent of test mode and does not depend on a generated fixture. The current HUD edit does not change `catalogPreview()` or `photoPreview()`.
   - Resolution: the test now requires the actual pinned delivery WebP URL. Photo/remodel selection and source/history identity were not changed.

2. `unknown saved IDs never become arbitrary paths; unsupported poses use the real visitor portrait`
   - For `catalogPreview('visitor','mika_cat',{pose:'../../file'})`, the actual safe fallback is `/assets/yard-ui/previews/19cba40fb0f0ea65e573aa346231a7ab462ce249f033e2cdf4335f999288ebb6.webp`.
   - The no-pose default used by the assertion is `/assets/yard-ui/current-portraits/4d8d146daecb44098c0584e7f6e01872e85398693664b1b177769a24aa3e1093.png`.
   - Classification: an unchanged product fallback inconsistency. A nonempty invalid pose bypasses the current-portrait override, then the catalog source resolver falls back to the historical default. Both URLs remain fixed catalog assets, so this is not arbitrary-path admission, but the two fallback portraits differ.
   - Resolution: an invalid or unsupported pose now takes the same current default as an omitted pose. Valid nap/pounce/sit aliases remain pinned byte-for-byte in focused coverage. This is a corrective runtime change, not a waived failure.

The skipped `every selected preview is a real checked-in asset` case is separate: it requires `YARD_UI_ASSET_ROOT`. Its skip does not explain either failure above.
