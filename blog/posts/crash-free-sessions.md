# How we got to 99.2% crash-free users without a rewrite

Crash-free sessions is a strange metric. At 98%, your dashboard looks fine and your reviews do not. At 99.2%, the app feels boring in the way a good tool should. Getting there took four months and exactly zero rewrites.

Here is what actually moved the number.

## Crash-free is a rate, not a bug count

The metric is simple: sessions that ended without a crash, divided by all sessions. That means it is a ratio, and ratios lie in useful ways.

If your app crashes 1,000 times but users open it 500,000 times, you are at 99.8%. If it crashes 40 times in 5,000 sessions, you are at 99.2% and probably fine. If it crashes 40 times in 5,000 sessions but they are all the *same* 40 users, you have a retention problem, not a crash problem.

Two consequences:

- **Track affected users, not just events.** One crash loop can produce hundreds of events from one person.
- **Segment the rate.** New users, low-RAM devices, and a specific Android version can each be far below your global average.

Our global number was 98.1%. On devices with 3GB of RAM, it was 96.4%. That is where the work was.

## Step 1: fix the top three by volume, then stop

The temptation is to open the crash dashboard and start at the top. That is correct, but only if you define "top" properly.

I sorted by **affected users × crash frequency**, not by raw event count. The order changed completely. The number one stack trace by events was a background sync edge case hit by a tiny number of power users. The number one by *people* was a null pointer in the quiz result screen, hit once by almost everyone who finished a test.

That single fix moved the global rate by 0.4 points. The background sync fix moved it by 0.02.

Three fixes took us from 98.1% to 98.9%:

1. **A `NullPointerException` on the result screen.** The API could return `null` for a score while grading was still in progress. The UI assumed a value. The fix was explicit state, not a null check sprinkled at the call site.
2. **A `IllegalStateException` in fragment transactions.** A dialog tried to show after `onSaveInstanceState`. The fix was to post state changes through the ViewModel and collect with `repeatOnLifecycle`.
3. **An `IndexOutOfBoundsException` in a list adapter.** A refresh replaced the backing list while a diff was running. The fix was to emit immutable lists and let `ListAdapter` own the diff.

None of these were exotic. All of them were reproducible on a slow device.

## Step 2: reproduce on the worst phone you support

The emulator lies. It has a fast disk, plenty of RAM, and no thermal throttling. Our worst crash reproduced in two minutes on a borrowed Redmi with Developer Options set to:

- **Don't keep activities** — on
- **Background process limit** — 1 process
- **Animations** — off, to make timing races more visible

Then a release build, not debug. R8 changes timing, inlining, and class loading. If a crash only reproduces in release, it is usually reflection, serialization, or a lifecycle race — and it is invisible in debug.

We added a low-end device to the CI smoke test. Not every device, just one. It caught two lifecycle bugs before release in the first month.

## Step 3: make every crash debuggable before you need it

The worst crashes are the ones you cannot reproduce. Make the report self-explanatory:

```kotlin
FirebaseCrashlytics.getInstance().apply {
    setCustomKey("screen", "quiz_result")
    setCustomKey("question_count", questions.size)
    setCustomKey("offline", !network.isOnline())
    setCustomKey("attempt", attemptNumber)
    log("Result rendered in ${durationMs}ms")
}
```

Three rules for custom keys:

- **No PII.** No emails, names, or free-text answers. User IDs only if they are opaque.
- **Low cardinality.** `screen`, `mode`, `network_state` are useful. A timestamp as a key is not a key.
- **Set them where context changes**, not in every function. I set them on screen entry and on major state transitions.

For non-fatal errors, log deliberately. We log failed syncs and recoverable parse errors with a `severity` key. That turned "the app feels slow" into "the sync endpoint times out for 4% of users on Jio."

## Step 4: fix the lifecycle, not the stack trace

Most Android crashes are not logic bugs. They are lifetime bugs. Something outlived something else.

The pattern that fixed the most issues:

```kotlin
// Activity collects, ViewModel owns the work
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { render(it) }
    }
}
```

Every collector is tied to visibility. Every request is tied to `viewModelScope`. Every dialog is driven by state, not by an imperative call from a callback. When the screen dies, the work dies with it.

If you take one thing from this post, take that. A surprising number of "random" crashes disappear when the lifetime rules are consistent.

## Step 5: guardrails, not heroics

Fixing bugs is a project. Preventing them is a system. What we added:

- **A crash-free alert threshold per release.** If a staged rollout drops below 99% for an hour, we halt the rollout.
- **Staged rollout, always.** 5% → 20% → 50% → 100%, with a day between stages.
- **Lint and Detekt in CI**, including lifecycle and coroutine rules. Boring, effective.
- **A release checklist** that includes "test on the low-end device" and "verify obfuscation mapping uploaded."
- **A weekly 20-minute crash review.** We look at the top five by affected users and assign an owner. No meeting, just a doc and a decision.

The weekly review is the highest-leverage thing on that list. It keeps crash work from becoming an occasional cleanup project.

## What didn't work

For balance:

- **Rewriting the app.** We considered it. The problems were three screens and a missing lifetime convention, not the architecture.
- **Catching everything.** Adding `try/catch` around suspect code moved crashes into silent failures. Our error rate looked better and our support tickets got worse.
- **Blaming OEMs.** Some crashes were OEM-specific. They were still our users, on our app, and we could still work around them.
- **Tracking total crash count.** It went up as we grew. The rate went down. The rate is the product.

## The result

| Month | Crash-free sessions | Crashes per 1k sessions | Notes |
| --- | --- | --- | --- |
| January | 98.1% | 19.4 | Baseline |
| February | 98.9% | 11.2 | Top three fixes |
| March | 99.0% | 9.6 | Lifecycle cleanup |
| April | 99.2% | 8.1 | Guardrails + staged rollout |

The number has stayed above 99% since, through several feature releases. That stability is the actual achievement. A high score you cannot hold is luck.

## The takeaway

Crash-free percentage is a product metric wearing an engineering costume. Fix the crashes that affect the most people, make them reproducible on cheap hardware, tie work to the right lifetime, and put a system in place so the next regression gets caught by a rollout instead of a review.

No rewrite required. Most of the time, no rewrite is the point.
