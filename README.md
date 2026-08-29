# Garmin Connect Pace Calculator

Go to any Garmin Connect activity, click the Itervals/Laps tab and simply select the laps you're interested in. A new table footer will appear with the average
time per lap, along with total time and distance, average pace, and average power (if available) for selected laps.

## Changelog

### 2.0.0 - 2026-08-29

- Restored compatibility with Garmin's current Intervals workout tables.
- Added support for Garmin's current plain Laps tables.
- Added a Select all control with checked and partial-selection states.
- Improved extension reinitialization after Garmin activity navigation and table rerenders.
- Fixed selected-row detection and summary updates when laps are selected or deselected.
- Kept summary metrics aligned with Garmin's table columns across both table variants.
- Removed redundant and empty summary columns while preserving the leading Intervals spacer.
- Extended the summary background across the full table width.
- Prevented the table from resizing when the empty summary changes to selected values.
- Added deterministic browser fixtures and live Garmin diagnostic tooling.
- Modernized runtime and build dependencies and resolved known dependency vulnerabilities.

### 1.1.0

- Upgraded dependencies and fixed a bug in the Laps table.

### 1.0.0

- Upgraded dependencies, switched to TypeScript, and adjusted selectors for Garmin class changes.

### 0.6.0

- Added the Stryd lap power metric to the summary when available.

### 0.5.0

- Adjusted to changes in Garmin "steps" workouts, upgraded all dependencies, and migrated to Manifest V3.

### 0.4.0

- Adjusted to changes in Garmin "steps" workouts.

### 0.3.17

- Fixed custom workout handling and navigation between activities using the previous and next buttons.

### 0.2.0

- Added support for laps lasting longer than 60 minutes.

### 0.1.2

- Initial version.
