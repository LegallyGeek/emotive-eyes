package com.legalgeeklabs.emotiveeyes.drivers.compose

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.legalgeeklabs.emotiveeyes.drivers.android.SystemMotionSettings

private const val GLOW_MIN_SDK = Build.VERSION_CODES.S
private const val GLOW_BLUR_DP = 10
private const val GLOW_ALPHA = 0.7f

/**
 * Procedural robot eyes, scaled uniformly to fit and centred in the available space. Draw them on a
 * dark background; the composable itself paints only the eyes.
 *
 * @param state animation state; use it to blink, glance, set statuses or tune springs
 * @param expression a preset name to transition to whenever it changes; `null` leaves [state] in control
 * @param color eye colour (default white, for monochrome displays)
 * @param glow draws a soft halo behind the eyes; only has an effect on API 31+
 * @param timeScale multiplier on elapsed time; 0.25 is slow motion
 * @param blinking whether eyes blink on their own
 * @param idleGaze whether eyes drift around on their own
 * @param reducedMotion critically damped transitions and glances, no idle saccades, blinks kept; defaults to the
 *   system "remove animations" setting
 * @param label accessibility description of the face
 */
@Composable
public fun Eyes(
    modifier: Modifier = Modifier,
    state: EyesState = rememberEyesState(),
    expression: String? = null,
    color: Color = Color.White,
    glow: Boolean = false,
    timeScale: Float = 1f,
    blinking: Boolean = true,
    idleGaze: Boolean = true,
    reducedMotion: Boolean = rememberSystemReducedMotion(),
    label: String = "Eyes",
) {
    LaunchedEffect(state) { state.run() }
    LaunchedEffect(state, timeScale) { state.timeScale = timeScale }
    LaunchedEffect(state, blinking) { state.setBlinking(blinking) }
    LaunchedEffect(state, idleGaze) { state.setIdleGaze(idleGaze) }
    LaunchedEffect(state, reducedMotion) { state.setReducedMotion(reducedMotion) }
    LaunchedEffect(state, expression) { expression?.let(state::setExpression) }

    val semanticsModifier =
        modifier.semantics {
            contentDescription = label
            role = Role.Image
        }
    Box(semanticsModifier) {
        if (glow && Build.VERSION.SDK_INT >= GLOW_MIN_SDK) {
            val blurPx = with(LocalDensity.current) { GLOW_BLUR_DP.dp.toPx() }
            Canvas(
                Modifier
                    .matchParentSize()
                    .graphicsLayer { renderEffect = BlurEffect(blurPx, blurPx, TileMode.Decal) },
            ) { drawFace(state.geometry, state.layout, color.copy(alpha = GLOW_ALPHA)) }
        }
        Canvas(Modifier.matchParentSize()) { drawFace(state.geometry, state.layout, color) }
    }
}

/** Remembers whether the system asks to remove animations, updating live when the setting changes. */
@Composable
public fun rememberSystemReducedMotion(): Boolean {
    val context = LocalContext.current
    var reduced by remember(context) { mutableStateOf(SystemMotionSettings.isReducedMotion(context)) }
    DisposableEffect(context) {
        val stop = SystemMotionSettings.observe(context) { reduced = SystemMotionSettings.isReducedMotion(context) }
        onDispose(stop)
    }
    return reduced
}
