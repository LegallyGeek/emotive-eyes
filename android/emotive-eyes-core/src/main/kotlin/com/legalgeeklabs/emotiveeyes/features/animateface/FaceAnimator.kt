package com.legalgeeklabs.emotiveeyes.features.animateface

import com.legalgeeklabs.emotiveeyes.entities.EyeParams
import com.legalgeeklabs.emotiveeyes.entities.FaceParams
import com.legalgeeklabs.emotiveeyes.entities.MotionSpec
import com.legalgeeklabs.emotiveeyes.entities.Spring
import com.legalgeeklabs.emotiveeyes.entities.SpringConstants
import com.legalgeeklabs.emotiveeyes.entities.SpringOverride
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.entities.blinkFactor
import com.legalgeeklabs.emotiveeyes.entities.blinkTotalMs
import com.legalgeeklabs.emotiveeyes.entities.criticalDamping
import com.legalgeeklabs.emotiveeyes.entities.intervalSteps
import com.legalgeeklabs.emotiveeyes.entities.stepSpring
import com.legalgeeklabs.emotiveeyes.entities.steps
import kotlin.math.abs
import kotlin.math.floor

/** Injected source of values in `[0, 1)`; the animator's only source of nondeterminism. */
public fun interface RandomSource {
    /** Returns the next value in `[0, 1)`. */
    public fun next(): Double
}

private class Timer {
    var count = 0
    var active = false
}

private class BlinkState {
    var inProgress = false
    var elapsedSteps = 0
    var isDouble = false
    var totalSteps = 0
}

/**
 * Deterministic face animator (spec/SPEC.md, "Animator"): springs, blink, idle gaze and glance on a
 * fixed substep clock. Not thread-safe; drive it from one thread.
 *
 * Construction always draws two random values (blink then saccade interval), regardless of flags.
 *
 * @param motion motion constants; `substepHz` is fixed for the animator's lifetime
 * @param random injected random source
 * @param initial fully resolved per-eye parameters the springs start at rest on
 */
public class FaceAnimator(
    private val motion: MotionSpec,
    private val random: RandomSource,
    initial: FaceParams,
    blinking: Boolean = true,
    idleGaze: Boolean = true,
    reducedMotion: Boolean = false,
) {
    private val hz = motion.substepHz
    private val h = 1 / hz
    private val hMs = 1000 / hz
    private val blinkCfg = motion.blink
    private val saccade = motion.saccade
    private val glanceCfg = motion.glance

    private var expressionConstants = motion.springs.expression
    private var gazeConstants = motion.springs.gaze

    private val leftSprings = springsOf(initial.left)
    private val rightSprings = springsOf(initial.right)
    private val expressionSprings = leftSprings + rightSprings
    private val gx = Spring(0.0)
    private val gy = Spring(0.0)

    private val blinkTimer = Timer()
    private val saccadeTimer = Timer()
    private val glanceTimer = Timer()
    private val blinkState = BlinkState()
    private var blinkingFlag = blinking
    private var idleGazeFlag = idleGaze
    private var reducedMotionFlag = reducedMotion
    private var acc = 0.0

    init {
        // Draw order is normative: construction always consumes two values.
        val rBlink = random.next()
        val rSaccade = random.next()
        blinkTimer.count = drawBlinkInterval(rBlink)
        blinkTimer.active = blinkingFlag
        saccadeTimer.count = drawSaccadeInterval(rSaccade)
        saccadeTimer.active = saccadesEnabled()
    }

    private fun saccadesEnabled() = idleGazeFlag && !reducedMotionFlag

    private fun drawBlinkInterval(r: Double) = intervalSteps(blinkCfg.intervalMs, r, hz)

    private fun drawSaccadeInterval(r: Double) = intervalSteps(saccade.intervalMs, r, hz)

    private fun setGazeTarget(
        x: Double,
        y: Double,
    ) {
        gx.target = x
        gy.target = y
    }

    private fun startBlink() {
        val rDouble = random.next()
        val rNext = random.next()
        blinkState.isDouble = rDouble < blinkCfg.doubleBlinkChance
        blinkState.inProgress = true
        blinkState.elapsedSteps = 0
        blinkState.totalSteps = steps(blinkTotalMs(blinkCfg, blinkState.isDouble), hz)
        blinkTimer.count = blinkState.totalSteps + drawBlinkInterval(rNext)
        blinkTimer.active = blinkingFlag
    }

    private fun fireSaccade() {
        val rx = random.next()
        val ry = random.next()
        val rNext = random.next()
        setGazeTarget((2 * rx - 1) * saccade.amplitude.x, (2 * ry - 1) * saccade.amplitude.y)
        saccadeTimer.count = drawSaccadeInterval(rNext)
    }

    private fun onSaccadesEnabledChanged(wasEnabled: Boolean) {
        val isEnabled = saccadesEnabled()
        if (!wasEnabled && isEnabled) {
            saccadeTimer.count = drawSaccadeInterval(random.next())
            saccadeTimer.active = true
        } else if (wasEnabled && !isEnabled) {
            saccadeTimer.active = false
            if (!glanceTimer.active) setGazeTarget(0.0, 0.0)
        }
    }

    private fun substep() {
        if (blinkTimer.active) {
            blinkTimer.count -= 1
            if (blinkTimer.count <= 0) startBlink()
        }
        // The glance-active check must precede the glance timer's decrement below.
        if (saccadeTimer.active && !glanceTimer.active) {
            saccadeTimer.count -= 1
            if (saccadeTimer.count <= 0) fireSaccade()
        }
        if (glanceTimer.active) {
            glanceTimer.count -= 1
            if (glanceTimer.count <= 0) {
                glanceTimer.active = false
                setGazeTarget(0.0, 0.0)
            }
        }

        val expr = expressionConstants
        val exprDamping = if (reducedMotionFlag) criticalDamping(expr.stiffness) else expr.damping
        for (spring in expressionSprings) stepSpring(spring, expr.stiffness, exprDamping, h)
        val gaze = gazeConstants
        val gazeDamping = if (reducedMotionFlag) criticalDamping(gaze.stiffness) else gaze.damping
        stepSpring(gx, gaze.stiffness, gazeDamping, h)
        stepSpring(gy, gaze.stiffness, gazeDamping, h)

        if (blinkState.inProgress) {
            blinkState.elapsedSteps += 1
            if (blinkState.elapsedSteps >= blinkState.totalSteps) blinkState.inProgress = false
        }
    }

    private fun eyeFrame(
        s: List<Spring>,
        factor: Double,
    ) = EyeParams(
        offsetX = s[0].value + gx.value,
        offsetY = s[1].value + gy.value,
        scaleX = s[2].value,
        scaleY = s[3].value * factor,
        roundness = s[4].value,
        upperLid = s[5].value,
        upperLidTilt = s[6].value,
        lowerLid = s[7].value,
        lowerLidBend = s[8].value,
    )

    /** The current frame without advancing time. */
    public fun frame(): FaceParams {
        val factor =
            if (blinkState.inProgress) {
                blinkFactor(blinkState.elapsedSteps * hMs, blinkCfg, blinkState.isDouble)
            } else {
                1.0
            }
        return FaceParams(eyeFrame(leftSprings, factor), eyeFrame(rightSprings, factor))
    }

    /**
     * Advances time by [dtMs] (NaN or negative counts as 0, capped at `maxStepMs`) and returns the
     * current frame, also when no whole substep elapsed.
     */
    public fun step(dtMs: Double): FaceParams {
        val clean = if (dtMs.isNaN() || dtMs < 0) 0.0 else dtMs
        val dt = minOf(clean, motion.maxStepMs)
        acc = acc + dt
        val n = floor(acc / hMs).toInt()
        acc = acc - n * hMs
        repeat(n) { substep() }
        return frame()
    }

    /** Sets all 18 spring targets; values and velocities are kept, so transitions are interruptible. */
    public fun setTarget(target: FaceParams) {
        applyTarget(leftSprings, target.left)
        applyTarget(rightSprings, target.right)
    }

    private fun applyTarget(
        springs: List<Spring>,
        p: EyeParams,
    ) {
        p.toList().forEachIndexed { i, v -> springs[i].target = v }
    }

    /** Starts a blink unless one is in progress (then a no-op that draws nothing). */
    public fun blink() {
        if (!blinkState.inProgress) startBlink()
    }

    /** Looks toward [direction] (components in `[-1, 1]`) for the configured hold; works under reduced motion too (critically damped). */
    public fun glance(direction: Vec2) {
        setGazeTarget(direction.x * glanceCfg.offset.x, direction.y * glanceCfg.offset.y)
        glanceTimer.count = steps(glanceCfg.holdMs, hz)
        glanceTimer.active = true
    }

    /** Enables or disables automatic blinking; an in-progress blink always finishes. No-op if unchanged. */
    public fun setBlinking(value: Boolean) {
        if (blinkingFlag == value) return
        blinkingFlag = value
        if (value) {
            blinkTimer.count = drawBlinkInterval(random.next())
            blinkTimer.active = true
        } else {
            blinkTimer.active = false
        }
    }

    /** Enables or disables idle gaze saccades. No-op if unchanged. */
    public fun setIdleGaze(value: Boolean) {
        if (idleGazeFlag == value) return
        val was = saccadesEnabled()
        idleGazeFlag = value
        onSaccadesEnabledChanged(was)
    }

    /** Turns reduced motion on (critical damping, no idle saccades; an active glance continues) or off. No-op if unchanged. */
    public fun setReducedMotion(value: Boolean) {
        if (reducedMotionFlag == value) return
        val was = saccadesEnabled()
        reducedMotionFlag = value
        onSaccadesEnabledChanged(was)
    }

    /** Merges the supplied spring constants into the current ones for subsequent substeps. */
    public fun setSprings(
        expression: SpringOverride? = null,
        gaze: SpringOverride? = null,
    ) {
        if (expression != null) expressionConstants = merge(expressionConstants, expression)
        if (gaze != null) gazeConstants = merge(gazeConstants, gaze)
    }

    private fun merge(
        current: SpringConstants,
        o: SpringOverride,
    ) = SpringConstants(o.stiffness ?: current.stiffness, o.damping ?: current.damping)

    private fun isSpringSettled(s: Spring): Boolean {
        val eps = motion.settleEpsilon
        return abs(s.value - s.target) < eps && abs(s.velocity) < eps
    }

    /** True when all 20 springs are at rest on their targets and no blink or glance is active. */
    public fun isSettled(): Boolean =
        expressionSprings.all(::isSpringSettled) &&
            isSpringSettled(gx) &&
            isSpringSettled(gy) &&
            !blinkState.inProgress &&
            !glanceTimer.active

    /** Milliseconds until the next timer fires; [Double.POSITIVE_INFINITY] when none is scheduled. */
    public fun msUntilNextEvent(): Double {
        var min = Int.MAX_VALUE
        var any = false

        fun consider(count: Int) {
            any = true
            if (count < min) min = count
        }
        if (blinkTimer.active) consider(blinkTimer.count)
        if (saccadeTimer.active && !glanceTimer.active) consider(saccadeTimer.count)
        if (glanceTimer.active) consider(glanceTimer.count)
        return if (any) min * hMs else Double.POSITIVE_INFINITY
    }

    private companion object {
        fun springsOf(p: EyeParams): List<Spring> = p.toList().map { Spring(it) }
    }
}
