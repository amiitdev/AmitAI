# Action Mode

AmitAI can carry out a task on the phone — open an app, read the screen, tap,
type, scroll — through Android's accessibility service. Off by default.

## Why an accessibility service

Android gives no other supported way to read or tap another app's UI. The
service is enabled by **you** in Settings › Accessibility › AmitAI Action Mode;
AmitAI cannot grant it and never bypasses the system dialog. The manifest
guards it with `BIND_ACCESSIBILITY_SERVICE` so no other app can bind to it.

## Turning it on

1. AmitAI › Action Mode (drawer, or the hand icon in the header).
2. Read the disclosure, tap **Enable** → Android Settings.
3. Enable **AmitAI Action Mode**, come back: the card shows
   `Enabled and connected`.
4. Turn **Action Mode** on. Allow notifications — the ongoing card is the
   active indicator and carries **Stop**.

## What runs

| Piece | File |
|---|---|
| Service | `automation/AmitAccessibilityService.kt` |
| Engine | `automation/AutomationManager.kt` |
| Tree reading | `automation/AccessibilityNodeHelper.kt` |
| Safety | `automation/AutomationPolicy.kt` |
| State/history | `automation/AutomationState.kt` |
| Foreground service | `automation/AutomationService.kt` |
| Bridge | `automation/AmitAutomationModule.kt` |
| JS bridge / tools | `src/lib/automation.ts`, `src/lib/automationTools.ts` |
| UI | `src/screens/ActionModeScreen.tsx`, `AutomationBar`, `ConfirmActionDialog` |

Every action: preflight → read → policy → intent/node action/gesture → wait for
idle → **verify the screen changed** → history. No change ⇒ `failed`, never
`success`. Three misses in a row stop the session.

## Safety rules (enforced in Kotlin, not by the model)

- Password fields, OTP/PIN/CVV screens and banking/payment apps stop automation.
- System permission dialogs are never touched.
- Send / pay / delete / uninstall / logout taps require a fresh confirmation.
- Nothing is typed into a password node; the text is never read.
- 40 actions per session; ongoing notification with Stop; no wake locks.

## Status codes

`success`, `failed`, `timeout`, `cancelled`, `blocked`, `needs_confirmation` —
plus `error_code` (`permission_missing`, `action_mode_off`, `element_not_found`,
`no_visible_change`, `sensitive_screen`, `confirmation_required`,
`screen_not_readable`, `app_not_installed`, …).

## Play policy

Accessibility-based UI automation in third-party apps is a restricted use. This
build is a personal, debug-signed app. Before publishing: declare the
AccessibilityService in Play Console, keep the in-app disclosure + explicit
consent above, publish a privacy policy stating that screen text is processed
on-device and never uploaded, keep the permanent indicator and emergency stop,
and be prepared for review to reject the feature — ship a variant without it
rather than misdeclare.
