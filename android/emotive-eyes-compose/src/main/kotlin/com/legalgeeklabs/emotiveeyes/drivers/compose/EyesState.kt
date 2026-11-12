package com.legalgeeklabs.emotiveeyes.drivers.compose

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalContext
import com.legalgeeklabs.emotiveeyes.drivers.android.EyesSpec
import com.legalgeeklabs.emotiveeyes.drivers.android.KotlinRandomSource
import com.legalgeeklabs.emotiveeyes.entities.Expression
import com.legalgeeklabs.emotiveeyes.entities.FaceGeometry
import com.legalgeeklabs.emotiveeyes.entities.Layout
import com.legalgeeklabs.emotiveeyes.entities.SpringOverride
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.features.animateface.RandomSource
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusInput
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusResult
import com.legalgeeklabs.emotiveeyes.interfaces.EyesController
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.ceil

/**
 * Holds the eyes' animation state and drives it on the main thread. Every command first catches
 * the clock up, so it takes effect "now", then wakes the frame loop if it was sleeping.
 *
 * Call all members from the main thread. [run] is started by [Eyes]; it renders frames while
 * anything moves and sleeps (no frames) while settled, waking at the next timer or command.
 *
 * @param nanoClock monotonic nanosecond clock; injectable for tests
 */
public class EyesState(
    spec: EyesSpec,
    initialExpression: String = "neutral",
    random: RandomSource = KotlinRandomSource(),
    private val nanoClock: () -> Long = System::nanoTime,
) {
    private val controller =
        EyesController(spec.face, spec.motion, spec.status, random, initialExpression)
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var lastNanos = nanoClock()
    private var scale = 1.0

    /** Geometry of the current frame in face units; reading it from a draw scope redraws on change. */
    public var geometry: FaceGeometry by mutableStateOf(controller.step(0.0))
        private set

    /** Names of the expression presets. */
    public val expressionNames: List<String> = controller.expressionNames

    /** Face-space layout that [geometry] is expressed in. */
    public val layout: Layout = controller.layout

    /** Multiplier on elapsed time; below 1 is slow motion. Values `<= 0` are treated as a tiny positive. */
    public var timeScale: Float
        get() = scale.toFloat()
        set(value) {
            advance()
            scale = maxOf(value.toDouble(), MIN_TIME_SCALE)
            wake.trySend(Unit)
        }

    private fun advance() {
        val now = nanoClock()
        val dtMs = (now - lastNanos) / NANOS_PER_MS * scale
        lastNanos = now
        geometry = controller.step(dtMs)
    }

    private inline fun <T> command(block: () -> T): T {
        advance()
        return block().also { wake.trySend(Unit) }
    }

    /** Transitions to a named preset. @throws IllegalArgumentException if unknown */
    public fun setExpression(name: String): Unit = command { controller.setExpression(name) }

    /** Transitions to an ad-hoc expression resolved like a preset. */
    public fun setExpression(expression: Expression): Unit = command { controller.setExpression(expression) }

    /**
     * Updates input statuses; transitions to the derived expression and glances toward a changed input.
     * The first call is a baseline and never glances.
     */
    public fun setStatuses(inputs: List<StatusInput>): StatusResult = command { controller.setStatuses(inputs) }

    /** Looks toward [direction] (components in `[-1, 1]`) for a moment. */
    public fun glance(direction: Vec2): Unit = command { controller.glance(direction) }

    /** Blinks now unless a blink is in progress. */
    public fun blink(): Unit = command { controller.blink() }

    /** Enables or disables automatic blinking. */
    public fun setBlinking(value: Boolean): Unit = command { controller.setBlinking(value) }

    /** Enables or disables idle gaze saccades. */
    public fun setIdleGaze(value: Boolean): Unit = command { controller.setIdleGaze(value) }

    /** Turns reduced motion (critically damped, no saccades or glances) on or off. */
    public fun setReducedMotion(value: Boolean): Unit = command { controller.setReducedMotion(value) }

    /** Merges the supplied spring constants into the current ones. */
    public fun setSprings(
        expression: SpringOverride? = null,
        gaze: SpringOverride? = null,
    ): Unit = command { controller.setSprings(expression, gaze) }

    /** Runs the frame loop until cancelled; [Eyes] launches it, so call it yourself only without [Eyes]. */
    public suspend fun run(): Nothing {
        while (true) {
            if (controller.isSettled()) {
                val waitMs = controller.msUntilNextEvent() / scale
                if (waitMs.isFinite()) {
                    withTimeoutOrNull(maxOf(1L, ceil(waitMs).toLong())) { wake.receive() }
                } else {
                    wake.receive()
                }
            } else {
                withFrameNanos { }
            }
            advance()
        }
    }

    private companion object {
        const val NANOS_PER_MS = 1_000_000.0
        const val MIN_TIME_SCALE = 1e-3
    }
}

/** Creates and remembers an [EyesState] (keyed on the context only) using the specs packaged in this module's assets. */
@Composable
public fun rememberEyesState(initialExpression: String = "neutral"): EyesState {
    val context = LocalContext.current
    return remember(context) { EyesState(EyesSpec.fromAssets(context), initialExpression) }
}
