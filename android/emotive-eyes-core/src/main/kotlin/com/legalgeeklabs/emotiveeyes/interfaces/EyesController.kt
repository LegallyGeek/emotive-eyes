package com.legalgeeklabs.emotiveeyes.interfaces

import com.legalgeeklabs.emotiveeyes.entities.Expression
import com.legalgeeklabs.emotiveeyes.entities.FaceGeometry
import com.legalgeeklabs.emotiveeyes.entities.FaceParams
import com.legalgeeklabs.emotiveeyes.entities.FaceSpec
import com.legalgeeklabs.emotiveeyes.entities.Layout
import com.legalgeeklabs.emotiveeyes.entities.MotionSpec
import com.legalgeeklabs.emotiveeyes.entities.Side
import com.legalgeeklabs.emotiveeyes.entities.SpringOverride
import com.legalgeeklabs.emotiveeyes.entities.StatusSpec
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.entities.computeFaceGeometry
import com.legalgeeklabs.emotiveeyes.entities.resolveParams
import com.legalgeeklabs.emotiveeyes.features.animateface.FaceAnimator
import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusInput
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusResult
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusTracker

/**
 * Wires animator, status tracker and geometry behind one API (the Kotlin twin of the JS
 * `createEyesController`). The last of [setExpression] / [setStatuses] wins. Not thread-safe.
 *
 * @throws SpecException if the status spec maps to an expression the face spec lacks
 * @throws IllegalArgumentException if [initialExpression] is unknown
 */
public class EyesController(
    private val face: FaceSpec,
    motion: MotionSpec,
    status: StatusSpec,
    random: RandomSource,
    initialExpression: String = "neutral",
    blinking: Boolean = true,
    idleGaze: Boolean = true,
    reducedMotion: Boolean = false,
) {
    /** Names of the available expression presets, in spec order. */
    public val expressionNames: List<String> = face.expressions.keys.toList()

    private val tracker = StatusTracker(status)
    private val animator: FaceAnimator

    init {
        for ((severity, name) in status.expressionFor) {
            if (name !in
                face.expressions
            ) {
                throw SpecException("status.expressionFor.$severity: unknown expression \"$name\"")
            }
        }
        if (status.emptyExpression !in face.expressions) {
            throw SpecException("status.emptyExpression: unknown expression \"${status.emptyExpression}\"")
        }
        animator = FaceAnimator(motion, random, resolve(named(initialExpression)), blinking, idleGaze, reducedMotion)
    }

    private fun named(name: String): Expression =
        face.expressions[name] ?: throw IllegalArgumentException("Unknown expression \"$name\"")

    private fun resolve(expression: Expression): FaceParams =
        FaceParams(
            left = resolveParams(face.defaults, expression, Side.LEFT),
            right = resolveParams(face.defaults, expression, Side.RIGHT),
        )

    /** Transitions to a named preset. @throws IllegalArgumentException if [name] is unknown */
    public fun setExpression(name: String) {
        animator.setTarget(resolve(named(name)))
    }

    /** Transitions to an ad-hoc expression resolved like a preset. */
    public fun setExpression(expression: Expression) {
        animator.setTarget(resolve(expression))
    }

    /**
     * Updates the status tracker, transitions to the derived expression and glances if warranted.
     *
     * @return the derived expression name and the glance direction, if any
     * @throws IllegalArgumentException for an unknown status or a duplicate input id
     */
    public fun setStatuses(inputs: List<StatusInput>): StatusResult {
        val result = tracker.update(inputs)
        animator.setTarget(resolve(named(result.expression)))
        result.glance?.let(animator::glance)
        return result
    }

    /** Looks toward [direction] (components in `[-1, 1]`) for a moment. */
    public fun glance(direction: Vec2) {
        animator.glance(direction)
    }

    /** Starts a blink unless one is in progress. */
    public fun blink() {
        animator.blink()
    }

    /** Enables or disables automatic blinking. */
    public fun setBlinking(value: Boolean) {
        animator.setBlinking(value)
    }

    /** Enables or disables idle gaze saccades. */
    public fun setIdleGaze(value: Boolean) {
        animator.setIdleGaze(value)
    }

    /** Turns reduced motion on or off. */
    public fun setReducedMotion(value: Boolean) {
        animator.setReducedMotion(value)
    }

    /** Merges the supplied spring constants into the current ones. */
    public fun setSprings(
        expression: SpringOverride? = null,
        gaze: SpringOverride? = null,
    ) {
        animator.setSprings(expression, gaze)
    }

    /** Advances time by [dtMs] and returns the geometry of the current frame, in face units. */
    public fun step(dtMs: Double): FaceGeometry = computeFaceGeometry(animator.step(dtMs), face.layout)

    /** True when nothing is moving or pending, so a driver may stop its frame loop. */
    public fun isSettled(): Boolean = animator.isSettled()

    /** Milliseconds until the next timer event; infinity when none is scheduled. */
    public fun msUntilNextEvent(): Double = animator.msUntilNextEvent()

    /** Layout of the face space the geometry is expressed in. */
    public val layout: Layout get() = face.layout
}
