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

/** One blink keyframe: eye height and width multipliers reached [ms] after the previous keyframe. */
public data class BlinkKeyframe(
    val height: Double,
    val width: Double,
    val ms: Double,
)

/** Height and width multipliers of a blink at one instant; (1, 1) means no blink. */
public data class BlinkSample(
    val height: Double,
    val width: Double,
)

/**
 * Blink behaviour (motion.json `blink`).
 *
 * @property anchor default line position for automatic blinks, in `[-1, 1]`: -1 top, 0 centre, +1 bottom
 * @property style name of the default entry in [styles]
 * @property levelFrom eye height multiplier below which lids fade and the eyes start levelling
 * @property levelTo height multiplier at or below which lids are gone and both eyes are level
 * @property styles named keyframe tables; each ends at height 1, width 1
 */
public data class BlinkSpec(
    val intervalMs: Interval,
    val doubleBlinkChance: Double,
    val doubleBlinkGapMs: Double,
    val anchor: Double,
    val style: String,
    val levelFrom: Double,
    val levelTo: Double,
    val styles: Map<String, List<BlinkKeyframe>>,
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
