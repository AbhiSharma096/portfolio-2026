# Shipping on-device AI without wrecking battery or trust

A demo of an AI feature takes an afternoon. Shipping one takes a quarter, and most of that time has nothing to do with the model.

NutriFit scans a photo of food and estimates nutrition. It started as a cloud call, moved partly on-device, and now runs on phones that are not flagship devices. Along the way I learned that **latency is a design material**, battery is a feature, and trust is something you have to earn before the first result appears.

## The feature is not the model

The model returned calories, macros, and a confidence score. Users wanted three different things: *is this okay to eat*, *how much of it*, and *what should I eat later*. Nobody opened the app to read a JSON payload with a confidence score.

The feature was really:

- A camera flow that works in bad light
- A result screen that admits uncertainty
- A correction path when the model is wrong
- A history that makes the next scan smarter

The model was maybe 20% of the work. If you are planning an AI feature, plan the other 80% first.

## Decide where inference runs

The honest comparison:

| Dimension | Cloud | On-device |
| --- | --- | --- |
| Latency | 400–2000ms, network dependent | 80–900ms, device dependent |
| Cost | Per request | Free after download |
| Privacy | Image leaves the device | Nothing leaves |
| Model quality | Best available | Constrained by phone |
| Offline | No | Yes |
| App size | Small | Model download or bundled |
| Failure mode | Timeout, quota | Thermal throttling, memory |

My rule: **if the input is personal, prefer on-device; if the task needs the best possible model, use cloud with explicit consent.** NutriFit uses on-device for the first pass and only offers an optional cloud refinement for hard cases.

Never silently switch between the two. A user who chose "on-device only" and later sees a network request has lost trust in every other setting you ship.

## Budget the battery

Battery is the feature nobody asks for until it is gone. Things that helped:

- **Batch the work.** One inference per scan, not a stream of frames. I dropped a "live preview" mode that ran inference continuously because it warmed the phone for no real benefit.
- **Use the cheapest model that clears the quality bar.** A smaller classifier for "is this even food" saved a full inference on roughly a third of camera opens.
- **Stop when the app is not visible.** Same structured-concurrency rules as any other work: no inference in a scope that outlives the screen.
- **Watch thermals, not just time.** A 300ms inference repeated for two minutes is a different problem from one 900ms inference.

A useful measurement: run ten scans in a row on a mid-range device and check battery drain and device temperature. If the tenth scan is dramatically slower than the first, you have a thermal problem, and users will feel it as "the app gets bad after a while."

## Make latency a design material

900ms is an eternity if you show a spinner, and barely noticeable if you show progress.

What worked:

1. **Show the photo immediately.** The user's own image is instant feedback.
2. **Name the step.** "Finding the dish" then "Estimating portions" feels faster than an indeterminate spinner, even when it takes the same time.
3. **Stream partial results.** Show the detected dish before the nutrition numbers land.
4. **Never block typing.** If the user wants to correct the dish name, let them start before inference finishes.

```kotlin
sealed interface ScanState {
    data object Capturing : ScanState
    data class Analyzing(val stage: Stage) : ScanState
    data class Partial(val dish: Dish) : ScanState
    data class Ready(val result: Nutrition) : ScanState
    data class NeedsReview(val reason: String) : ScanState
}
```

That last state matters more than the others. A confident wrong answer is worse than an honest "I'm not sure, can you confirm?"

## Trust is a UX surface

AI features fail in ways normal features don't. They are confidently wrong, they are biased by their training data, and they cannot explain themselves well. Design for that.

- **Show uncertainty in plain language.** "Looks like paneer, about 320 kcal" beats "0.73 confidence."
- **Make correction one tap.** Every correction is also training data for your own evaluation set.
- **Say what leaves the device.** A single line in settings, written like a human, not a privacy policy.
- **Give an off switch.** Users who can turn it off are more willing to leave it on.
- **Never auto-post, auto-send, or auto-order.** AI suggests. Humans commit.

## What I'd do differently

Three things, in order:

1. **Build the evaluation set before the feature.** Fifty labelled photos from real users taught me more than a month of prompt tweaking. Without it, every change was a guess.
2. **Pick the device floor early.** I prototyped on a flagship and shipped to phones with a third of the RAM. Test on the cheapest supported device from day one.
3. **Instrument the failure path, not just the happy path.** Time-to-result is easy to measure. Rate of "user corrected the model" is what tells you if the feature is actually good.

## Closing

On-device AI is not magic, and it is not a checkbox. It is a latency budget, a battery budget, and a trust budget, all spent at once. The teams that ship it well are the ones that treat those budgets as product decisions rather than engineering details.

The best compliment NutriFit gets is not "the AI is impressive." It is "it got my lunch right." That is the bar. Clear it, and the model disappears into the product where it belongs.
