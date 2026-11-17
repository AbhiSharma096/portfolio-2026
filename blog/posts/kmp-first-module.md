# Migrating a real module to Kotlin Multiplatform: start with the boring one

Kotlin Multiplatform has a demo problem. Every talk shows a shared screen with a login form and a cute animation, and every attendee goes home wondering where to start in a 200,000-line app.

The answer is not the UI. It is the most boring module you have — the one with the least Android in it.

I have been moving pieces of an Android app into KMP this year, one module at a time. Here is the sequence that worked, the code that made it click, and the parts I would skip next time.

## The boundary test

Before touching Gradle, I ask one question about a module:

> Could I test this entirely on a JVM, with no emulator and no `Context`?

If the answer is yes, it is a KMP candidate. If it needs a `Context`, a `View`, or a lifecycle, it stays Android for now.

That test is not about ideology. It is about how much `expect`/`actual` pain you are buying. A module with one platform dependency is a good first migration. A module with nine is a research project.

## Pick a module with zero Android imports

Ours was the quiz scoring engine. It took a question set, an answer map, and a time limit, and returned a score plus a per-topic breakdown. Pure Kotlin. Lots of unit tests. Twenty-something files.

It was perfect:

- **High test coverage already existed**, so a regression would be obvious.
- **No UI**, so no Compose or View interop.
- **Used daily**, so a bug would surface fast.
- **Owned by one team**, so coordination was cheap.

We did not start with networking or the database. Those have platform-specific drivers, and the first migration should teach you the build system, not `expect`/`actual` gymnastics.

## Move, keep, or rewrite

Before the migration, label every file. Ours looked like this:

| Category | Example | Action |
| --- | --- | --- |
| Pure logic | Score calculator, answer validation | Move to `commonMain` |
| Data models | `Question`, `Attempt`, `Score` | Move, add `@Serializable` |
| Time | Timestamps, durations | Move, inject a `Clock` |
| Randomness | Shuffled answer order | Move, inject a `Random` |
| Formatting | "1h 20m" labels | Keep in Android for now |
| Persistence | Room entities | Keep, map at the boundary |
| Platform | Analytics events | Keep, expose an interface |

The rule: **move behavior, keep integration**. Anything that talks to the operating system stays put and is expressed as an interface in common code.

## `expect`/`actual` without regret

Our only genuinely platform-specific need was time. Instead of sprinkling `System.currentTimeMillis()` everywhere, we introduced a clock interface in common code:

```kotlin
// commonMain
expect class PlatformClock() {
    fun nowMillis(): Long
}

// androidMain
actual class PlatformClock actual constructor() {
    actual fun nowMillis(): Long = System.currentTimeMillis()
}

// iosMain
actual class PlatformClock actual constructor() {
    actual fun nowMillis(): Long =
        (NSDate().timeIntervalSince1970 * 1000).toLong()
}
```

Two rules that kept this sane:

1. **Inject the clock, do not call it.** Every function that needs time takes a `Clock` parameter or reads it from a small `Environment` object. Tests pass a fake. That one decision made the whole module deterministic in `commonTest`.
2. **Every `expect` needs a reason.** If a declaration exists only because "Android has it," it probably belongs in Android code. Our final shared module has two `expect` declarations. That is not a coincidence; it was a design goal.

## Serialization and Flow cross the boundary unchanged

The pleasant surprise: `kotlinx.serialization` and `kotlinx.coroutines` behave identically on both targets. The shared module exposes suspend functions and `Flow`, and the Android layer collects them the same way it always did.

```kotlin
class ScoreEngine(
    private val clock: Clock,
    private val random: Random,
) {
    fun score(attempt: Attempt): Flow<ScoreUpdate> = flow {
        emit(ScoreUpdate.InProgress(attempt.answeredCount))
        val result = calculate(attempt)
        emit(ScoreUpdate.Complete(result, clock.nowMillis()))
    }
}
```

No adapters, no wrappers, no "multiplatform flow." Just Flow. That is the payoff. The more your shared code looks like ordinary Kotlin, the less you notice the boundary.

## The Gradle change is smaller than the blog posts suggest

The module's `build.gradle.kts` became a KMP module with Android as one target:

```kotlin
kotlin {
    androidTarget()

    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach {
        it.binaries.framework {
            baseName = "SharedScoring"
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
        }
    }
}
```

The Android app keeps consuming it as a normal project dependency. Nothing in the app module changed on day one. That is the whole migration strategy: **change the module, not the app**.

## Tests are the point

The reason to do this is not "share code with iOS someday." It is that a pure Kotlin module is faster and cheaper to test than an Android module.

`commonTest` runs without an emulator, on the JVM and on the native targets. Our scoring suite went from 40 seconds on a device farm to under 3 seconds locally.

```kotlin
@Test
fun `late answers do not count`() = runTest {
    val engine = ScoreEngine(FakeClock(now = 10_000), Random(42))
    val attempt = attemptWith(answeredAt = 10_500, limitMs = 400)

    val result = engine.score(attempt).last()

    assertEquals(0, result.correct)
}
```

Notice the fake clock and seeded random. No flakiness, no `Thread.sleep`, no `Instant.now()` in the assertion. If you take one thing from this post, take testability as the goal and sharing as the side effect.

## What I would skip next time

- **Moving formatters first.** String resources and date formatting are more platform-coupled than they look. They can wait.
- **Trying to share ViewModels immediately.** Shared state holders are a second migration. Get the domain layer compiling on two targets first.
- **Building an iOS app on day one.** A `commonTest` that runs on `iosSimulatorArm64` proves the code compiles and behaves. That is enough for the first milestone.
- **Perfect source-set structure.** `commonMain` plus `androidMain` is enough. Do not create eight intermediate source sets before you have a reason.

## When KMP is the wrong call

Be honest about the cost. KMP adds build complexity, a second compiler target, and a debugging surface that most Android developers have not seen. If your shared code is small, a plain Kotlin module with interfaces may be enough. If your team has no iOS plans, the benefit is mostly testability — real, but smaller.

We did not move the UI, and we are not planning to yet. Compose Multiplatform is promising, but our screens are Android-specific and heavily lifecycle-driven. The scoring engine does not care about that. That is exactly why it went first.

## The sequence that worked

1. Pick a module with no Android imports and good tests.
2. Label every file move / keep / rewrite.
3. Move behavior, keep integration, inject the platform (clock, random).
4. Configure the KMP module; leave the app untouched.
5. Get `commonTest` green on JVM and one native target.
6. Ship it behind the existing Android UI.
7. Repeat with the next boring module.

No big-bang migration, no rewrite, no shared UI debate. Just one module that became easier to test and, eventually, reusable.

The exciting part of Kotlin Multiplatform is the demo. The useful part is the boring module. Start there.
