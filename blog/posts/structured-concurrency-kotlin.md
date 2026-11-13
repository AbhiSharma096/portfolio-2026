# Structured concurrency in Kotlin, explained by a bug I shipped

There is a particular kind of quiet panic that comes from watching a crash report reference a screen the user closed four seconds ago. The stack trace was clean. The crash was not.

We had a profile screen that loaded the user, their recent activity, and three small counters. Five requests in parallel, all fired from `viewModelScope`. On a good day it felt instant. On a bad day — rotation, back press, flaky network — the app would crash with a `CancellationException` that somebody had caught and rethrown incorrectly, or worse, complete a request and write state into a ViewModel that no longer had a screen.

The bug was not in the network layer. It was in my mental model of **structured concurrency**.

## The bug: work that outlived the screen

Here is roughly what I wrote:

```kotlin
fun load() {
    GlobalScope.launch {
        val profile = api.profile()
        val activity = api.activity()
        _state.value = State.Ready(profile, activity)
    }
}
```

`GlobalScope` was the original sin. It launches a coroutine with no parent, so nothing owns it. The ViewModel could be cleared, the screen destroyed, and that coroutine would still be running, still holding a reference to the ViewModel, still waiting to write into state nobody was observing.

The fix took one line:

```kotlin
fun load() {
    viewModelScope.launch {
        val profile = api.profile()
        val activity = api.activity()
        _state.value = State.Ready(profile, activity)
    }
}
```

But the important part is *why* that one line fixes it. `viewModelScope` is cancelled when `onCleared()` runs. Cancellation propagates down to every child coroutine automatically. The work does not outlive its owner.

That property — children never outlive their parent — is structured concurrency.

## What structured concurrency actually means

A `CoroutineScope` is not a thread pool. It is a **lifetime**.

When you launch a child, you are saying: this work belongs to this scope, and when this scope ends, the work ends too. The compiler doesn't enforce this. The API does, if you use it properly.

| Scope | Lifetime | Use it for |
| --- | --- | --- |
| `viewModelScope` | Until the ViewModel is cleared | Screen state, one-off loads |
| `lifecycleScope` | Until the Activity/Fragment is destroyed | UI-adjacent collection |
| `repeatOnLifecycle(STARTED)` | While the screen is visible | Collecting flows that drive UI |
| `applicationScope` | Process lifetime | Work that must finish, like log upload |

Notice there is no row for "background thread I need for a moment." That is usually a sign you want a structured scope you haven't defined yet.

## Three rules I follow now

### 1. Launch from a scope that dies with the screen

This is the rule I broke. If the result of the work is only meaningful while a screen exists, the work should die with that screen. `viewModelScope` is almost always the right owner for data loading, and `repeatOnLifecycle` is the right owner for flow collection.

There is a subtle version of this bug that survives a `viewModelScope` migration: collecting a flow in the wrong scope.

```kotlin
// Do this — collection pauses when the screen is not visible
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { render(it) }
    }
}
```

Without `repeatOnLifecycle`, collection continues in the background, consuming battery and CPU for pixels nobody sees.

### 2. Never pass a `CoroutineScope` into a function

If a function needs to do async work, make it a `suspend` function and let the caller decide the lifetime.

```kotlin
// Avoid
fun refresh(scope: CoroutineScope) {
    scope.launch { repository.sync() }
}

// Prefer
suspend fun refresh() = repository.sync()
```

The second version is honest about what it does. It suspends, it doesn't secretly start a fire-and-forget job, and the caller's scope decides when it stops. Scopes leaking into function signatures is how you end up with work that outlives everything.

### 3. Catch at the edge, not everywhere

I used to wrap every network call in `try/catch`. That made cancellation invisible and encouraged swallowing real failures.

Cancellation is cooperative. It works by throwing `CancellationException`, and if you catch it, you must rethrow it. A safer pattern is to catch specific exceptions where you can actually do something useful:

```kotlin
viewModelScope.launch {
    _state.value = State.Loading
    _state.value = try {
        State.Ready(repository.load())
    } catch (e: IOException) {
        State.Error("Check your connection and try again.")
    }
}
```

`CancellationException` is not an `IOException`, so it propagates and the scope shuts down correctly. If you must catch broadly, rethrow cancellation:

```kotlin
catch (e: Exception) {
    if (e is CancellationException) throw e
    // handle the rest
}
```

## The checklist

Before I call an async feature done, I ask:

- Who owns this work, and when does that owner die?
- If the user leaves mid-request, what happens to the result?
- Does any catch block swallow `CancellationException`?
- Is this collection tied to visibility, or is it running in the background?
- Am I using `async` and actually awaiting it inside the same scope?

If I can answer all five, the feature is usually boring in production. Boring is the goal.

## Closing

Structured concurrency didn't make my code faster. It made my code *finite* — every piece of work has an owner, a lifetime, and a clean way to stop. That is the whole promise. Once it clicked, most of my coroutine bugs stopped being mysterious and started being obvious.

The crash report that started this post is still in our tracker, closed and labelled. I keep the link around. It is a good reminder that the scariest bugs are often the ones that look like they should not compile.
