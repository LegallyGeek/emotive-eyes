package com.legalgeeklabs.emotiveeyes.entities

import kotlin.math.floor

/** `a + (b - a) * r`; the operation order is part of the contract. */
public fun lerp(
    a: Double,
    b: Double,
    r: Double,
): Double = a + (b - a) * r

/** Milliseconds to substeps, rounding half up (never `round`, which is half-to-even). */
public fun steps(
    ms: Double,
    substepHz: Double,
): Int = floor((ms * substepHz) / 1000 + 0.5).toInt()

/** Draws a substep count from a `[min, max]` interval in milliseconds using one random value. */
public fun intervalSteps(
    interval: Interval,
    r: Double,
    substepHz: Double,
): Int = steps(lerp(interval.min, interval.max, r), substepHz)
