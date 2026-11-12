package com.legalgeeklabs.emotiveeyes.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.legalgeeklabs.emotiveeyes.drivers.compose.Eyes
import com.legalgeeklabs.emotiveeyes.drivers.compose.rememberEyesState
import com.legalgeeklabs.emotiveeyes.entities.Vec2
import com.legalgeeklabs.emotiveeyes.features.reportstatus.StatusInput
import kotlinx.coroutines.delay

private const val CYCLE_HOLD_MS = 2200L
private const val SLOW_MOTION = 0.25f
private val STATUSES = listOf("ok", "busy", "warning", "offline", "error")
private val INPUTS =
    listOf(
        "Camera" to Vec2(-1.0, 0.0),
        "Microphone" to Vec2(0.0, 1.0),
        "Network" to Vec2(1.0, 0.0),
    )
private val COLORS = listOf("White" to Color.White, "Cyan" to Color(0xFF00E5FF))

/** Eyes pinned at the top; every control scrolls beneath them. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DemoScreen() {
    val eyes = rememberEyesState()
    var expression by remember { mutableStateOf(eyes.expressionNames.first()) }
    var cycling by remember { mutableStateOf(false) }
    var blinking by remember { mutableStateOf(true) }
    var idleGaze by remember { mutableStateOf(true) }
    var glow by remember { mutableStateOf(false) }
    var slow by remember { mutableStateOf(false) }
    var colorIndex by remember { mutableStateOf(0) }
    var statuses by remember { mutableStateOf(INPUTS.associate { it.first to "ok" }) }
    var derived by remember { mutableStateOf("neutral") }

    fun report(next: Map<String, String>) {
        statuses = next
        val inputs = INPUTS.map { (name, dir) -> StatusInput(name, next.getValue(name), dir) }
        val result = eyes.setStatuses(inputs)
        derived = result.expression
        expression = result.expression
    }

    // The first update is the status baseline, so it must precede any user-driven change.
    LaunchedEffect(Unit) { report(statuses) }
    LaunchedEffect(cycling) {
        if (!cycling) return@LaunchedEffect
        while (true) {
            for (name in eyes.expressionNames) {
                expression = name
                eyes.setExpression(name)
                delay(CYCLE_HOLD_MS)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding()) {
        Eyes(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).aspectRatio(2f),
            state = eyes,
            color = COLORS[colorIndex].second,
            glow = glow,
            timeScale = if (slow) SLOW_MOTION else 1f,
            blinking = blinking,
            idleGaze = idleGaze,
            label = "Robot eyes showing $expression",
        )
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Section("Expression") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    eyes.expressionNames.forEach { name ->
                        FilterChip(
                            selected = expression == name,
                            onClick = {
                                cycling = false
                                expression = name
                                eyes.setExpression(name)
                            },
                            label = { Text(name) },
                        )
                    }
                    FilterChip(selected = cycling, onClick = { cycling = !cycling }, label = { Text("Cycle all") })
                }
            }
            Section("Actions") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { eyes.blink() }) { Text("Blink") }
                    OutlinedButton(onClick = { eyes.glance(Vec2(-1.0, 0.0)) }) { Text("Glance left") }
                    OutlinedButton(onClick = { eyes.glance(Vec2(1.0, 0.0)) }) { Text("Glance right") }
                }
            }
            Section("Status") {
                INPUTS.forEach { (name, _) ->
                    Text(name, style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        STATUSES.forEach { status ->
                            FilterChip(
                                selected = statuses[name] == status,
                                onClick = {
                                    cycling = false
                                    report(statuses + (name to status))
                                },
                                label = { Text(status) },
                            )
                        }
                    }
                }
                Text("Derived expression: $derived", style = MaterialTheme.typography.bodyMedium)
            }
            Section("Options") {
                ToggleRow("Blinking", blinking) { blinking = it }
                ToggleRow("Idle gaze", idleGaze) { idleGaze = it }
                ToggleRow("Glow", glow) { glow = it }
                ToggleRow("Slow motion", slow) { slow = it }
            }
            Section("Color") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    COLORS.forEachIndexed { i, (name, _) ->
                        FilterChip(selected = colorIndex == i, onClick = { colorIndex = i }, label = { Text(name) })
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.outline)
        content()
    }
}

@Composable
private fun ToggleRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
