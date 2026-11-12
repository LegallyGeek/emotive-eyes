package com.legalgeeklabs.emotiveeyes.entities

private val OPEN = BlinkSample(1.0, 1.0)

/** Duration of one blink: the sum of its keyframe durations, in milliseconds. */
public fun blinkDuration(keyframes: List<BlinkKeyframe>): Double {
    var d = 0.0
    for (k in keyframes) d += k.ms
    return d
}

/** Duration of a blink, or of a double blink with [gapMs] between the halves, in milliseconds. */
public fun blinkTotalMs(
    keyframes: List<BlinkKeyframe>,
    gapMs: Double,
    isDouble: Boolean,
): Double {
    val d = blinkDuration(keyframes)
    return if (isDouble) 2 * d + gapMs else d
}

private fun singleSample(
    tMs: Double,
    keyframes: List<BlinkKeyframe>,
): BlinkSample {
    if (tMs < 0) return OPEN
    var prevT = 0.0
    var prevH = 1.0
    var prevW = 1.0
    for (k in keyframes) {
        val t = prevT + k.ms
        if (tMs < t) {
            val u = (tMs - prevT) / k.ms
            return BlinkSample(prevH + (k.height - prevH) * u, prevW + (k.width - prevW) * u)
        }
        prevT = t
        prevH = k.height
        prevW = k.width
    }
    return OPEN
}

/**
 * Height and width multipliers [tMs] after blink start, interpolating linearly between keyframes
 * from an implicit start of (1, 1). Returns (1, 1) outside the blink.
 */
public fun blinkSample(
    tMs: Double,
    keyframes: List<BlinkKeyframe>,
    gapMs: Double,
    isDouble: Boolean,
): BlinkSample {
    if (!isDouble) return singleSample(tMs, keyframes)
    val d = blinkDuration(keyframes)
    return when {
        tMs < d -> singleSample(tMs, keyframes)
        tMs < d + gapMs -> OPEN
        tMs < 2 * d + gapMs -> singleSample(tMs - d - gapMs, keyframes)
        else -> OPEN
    }
}

/** How far lids fade and eyes level: 0 above [levelFrom], 1 at or below [levelTo]. */
public fun blinkLevel(
    height: Double,
    levelFrom: Double,
    levelTo: Double,
): Double = minOf(1.0, maxOf(0.0, (levelFrom - height) / (levelFrom - levelTo)))
