package com.legalgeeklabs.emotiveeyes.entities

/** Stiffness (s^-2) and damping (s^-1) of a unit-mass spring. */
public data class SpringConstants(
    val stiffness: Double,
    val damping: Double,
)

/** A partial [SpringConstants] override; `null` fields keep the current value. */
public data class SpringOverride(
    val stiffness: Double? = null,
    val damping: Double? = null,
)

/** A `[min, max]` range. */
public data class Interval(
    val min: Double,
    val max: Double,
)

/** A 2D amount, used for gaze amplitude and glance offsets. */
public data class Vec2(
    val x: Double,
    val y: Double,
)

/** Blink timing (motion.json `blink`). */
public data class BlinkSpec(
    val closeMs: Double,
    val holdMs: Double,
    val openMs: Double,
    val minScale: Double,
    val intervalMs: Interval,
    val doubleBlinkChance: Double,
    val doubleBlinkGapMs: Double,
)

/** Idle gaze saccades (motion.json `saccade`). */
public data class SaccadeSpec(
    val intervalMs: Interval,
    val amplitude: Vec2,
)

/** Glances toward an input (motion.json `glance`). */
public data class GlanceSpec(
    val holdMs: Double,
    val offset: Vec2,
)

/** Spring constants for expression parameters and for gaze. */
public data class SpringsSpec(
    val expression: SpringConstants,
    val gaze: SpringConstants,
)

/** All motion constants (motion.json). */
public data class MotionSpec(
    val substepHz: Double,
    val maxStepMs: Double,
    val settleEpsilon: Double,
    val springs: SpringsSpec,
    val blink: BlinkSpec,
    val saccade: SaccadeSpec,
    val glance: GlanceSpec,
)

/** Layout, default parameters and named expressions (face.json). */
public data class FaceSpec(
    val layout: Layout,
    val defaults: EyeParams,
    val expressions: Map<String, Expression>,
)

/** Severity order (least to most severe) and its mapping to expressions (status.json). */
public data class StatusSpec(
    val severity: List<String>,
    val expressionFor: Map<String, String>,
    val emptyExpression: String,
)
