# Seven Compose performance fixes that actually moved the needle

The first time I measured our Compose feed on a mid-range device, the frame timing looked like a heartbeat monitor in a thriller. Spikes to 40ms, a dropped frame every few scrolls, and a cold start that felt fine on my phone and terrible on the one our support team kept mentioning.

I did what everyone does: I read a list of Compose performance tips and applied all of them. Roughly half did nothing measurable. These seven did.

Metrics are from Macrobenchmark on a Pixel 4a and a Redmi Note 11, release build, R8 enabled.

## 1. Stop reading state in the wrong scope

The biggest win was also the most boring. I was reading `scrollState.value` inside a composable that recomposed on every pixel of scroll, even though it only needed the value for a modifier.

```kotlin
// Recomposition on every scroll frame
val offset by scrollState.value
Box(Modifier.offset(y = offset.dp))
```

Reading state inside composition subscribes that composable to every change. Deferring the read to the layout phase fixes it:

```kotlin
Box(
    Modifier.offset { IntOffset(0, scrollState.value) }
)
```

The lambda version is read during layout, not composition, so scrolling no longer triggers recomposition.

**Result:** ~31% fewer recompositions while scrolling the feed.

## 2. Give every list item a stable, meaningful key

This one is repeated everywhere and it is repeated because it is true. Without keys, Compose matches items by position. Insert something at the top and every item below it is treated as new.

```kotlin
LazyColumn {
    items(
        items = posts,
        key = { post -> post.id }
    ) { post ->
        PostRow(post)
    }
}
```

The subtle part: the key must be stable across refreshes. If your "id" is a list index or a hash that changes when the server sends a new field, you have not solved anything. Use a real identity.

**Result:** item reuse across refreshes, and the "flicker after pull-to-refresh" bug disappeared.

## 3. Use `derivedStateOf` for values that change faster than the UI

I had a "back to top" button that appeared once the user scrolled past 300px. The naive version recomposed on every scroll offset change.

```kotlin
val showButton by remember {
    derivedStateOf { listState.firstVisibleItemIndex > 2 }
}
```

`derivedStateOf` collapses many state changes into a boolean that changes rarely. The composable only recomposes when the boolean flips, not on every scroll tick.

The rule I use: if the input changes more often than the output, derive it.

**Result:** the FAB stopped appearing in the recomposition profiler entirely.

## 4. Remember lambdas that are passed into composables

Lambdas allocated during composition are new objects on every recomposition, which can defeat skipping for child composables.

```kotlin
// New lambda instance each recomposition
PostRow(post = post, onClick = { openPost(post.id) })

// Stable reference
val onPostClick = remember(post.id) { { openPost(post.id) } }
PostRow(post = post, onClick = onPostClick)
```

This is a small win by itself. It becomes a large win when the child is expensive and the parent recomposes often. Do not `remember` everything blindly — measure first, then stabilize the expensive boundaries.

## 5. Keep image loading stable and honest

Glide and Coil are good at caching. They are not good at rescuing you from requesting a different size on every scroll.

Two fixes mattered:

- Request a fixed target size based on the layout, not the composable's current measured width.
- Keep the request object stable with `remember` so the loader does not restart on unrelated recompositions.

```kotlin
val request = remember(post.imageUrl) {
    ImageRequest.Builder(context)
        .data(post.imageUrl)
        .size(640, 360)
        .crossfade(true)
        .build()
}
AsyncImage(model = request, contentDescription = null)
```

**Result:** profile images stopped re-decoding during fast scrolls, and memory churn dropped noticeably.

## 6. Hoist expensive work out of composition

Formatting a date is cheap. Formatting 40 dates in a scroll frame is not. Neither is sorting a list during composition.

```kotlin
// Runs on every recomposition
val sorted = posts.sortedByDescending { it.publishedAt }

// Runs only when posts changes
val sorted = remember(posts) { posts.sortedByDescending { it.publishedAt } }
```

Better yet, do the sorting in the ViewModel where it belongs. Composition should be a description of the UI, not a place where you do data work.

## 7. Measure with Macrobenchmark instead of vibes

The most useful change was not code. It was a Macrobenchmark module that runs the same scroll on a release build and gives me frame timing I can compare across commits.

```kotlin
@Test
fun scrollFeed() = benchmarkRule.measureRepeated(
    packageName = "com.example.app",
    metrics = listOf(FrameTimingMetric()),
    iterations = 5,
    startupMode = StartupMode.WARM
) {
    startActivityAndWait()
    device.findObject(By.res("feed")).fling(Direction.DOWN)
}
```

Without this, every fix above is a rumour. With it, I know that fix 1 and fix 2 were worth the afternoon and fix 4 was worth about 4ms on one screen.

| Change | Frame time (p90) | Notes |
| --- | --- | --- |
| Baseline | 21.4 ms | Jank on scroll |
| Deferred state reads | 16.9 ms | Biggest single win |
| Stable keys | 15.8 ms | Removed refresh flicker |
| Stable image requests | 14.6 ms | Lower allocation churn |
| All seven | 11.2 ms | Smooth on the Redmi |

## What didn't matter

For completeness, three popular tips that produced no measurable change in our app:

- Wrapping every composable in `key()` regardless of context.
- Replacing `Column` with `LazyColumn` for eight static rows.
- Micro-optimizing string concatenation in a list that renders twice a screen.

They are not wrong. They were just not *our* bottleneck.

## The takeaway

Compose performance work is mostly about reading state in the right phase and keeping identity stable. The rest is measurement. Profile on the slowest device you support, fix the frame that actually spikes, and re-run the benchmark before you believe yourself.

The feed now holds 60fps on hardware that costs less than my headphones. That is the version of "modern Android" I care about.
