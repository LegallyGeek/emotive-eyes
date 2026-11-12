package com.legalgeeklabs.emotiveeyes.entities

/** Eyelid-closure factor of a single blink at [tMs] after blink start, in `[minScale, 1]`. */
public fun blinkCurve(
    tMs: Double,
    cfg: BlinkSpec,
): Double {
    val closeMs = cfg.closeMs
    val holdMs = cfg.holdMs
    val openMs = cfg.openMs
    val minScale = cfg.minScale
    if (tMs < 0) return 1.0
    if (tMs < closeMs) {
        val u = tMs / closeMs
        return 1 - (1 - minScale) * u * u
    }
    if (tMs < closeMs + holdMs) return minScale
    if (tMs < closeMs + holdMs + openMs) {
        val u = (tMs - closeMs - holdMs) / openMs
        return minScale + (1 - minScale) * (1 - (1 - u) * (1 - u))
    }
    return 1.0
}

/** Duration of one blink, or of a double blink, in milliseconds. */
public fun blinkTotalMs(
    cfg: BlinkSpec,
    isDouble: Boolean,
): Double {
    val d = cfg.closeMs + cfg.holdMs + cfg.openMs
    return if (isDouble) 2 * d + cfg.doubleBlinkGapMs else d
}

/** Height multiplier of a single or double blink at [tMs] after blink start. */
public fun blinkFactor(
    tMs: Double,
    cfg: BlinkSpec,
    isDouble: Boolean,
): Double {
    if (!isDouble) return blinkCurve(tMs, cfg)
    val d = cfg.closeMs + cfg.holdMs + cfg.openMs
    val gap = cfg.doubleBlinkGapMs
    return when {
        tMs < d -> blinkCurve(tMs, cfg)
        tMs < d + gap -> 1.0
        tMs < 2 * d + gap -> blinkCurve(tMs - d - gap, cfg)
        else -> 1.0
    }
}
