package com.legalgeeklabs.emotiveeyes.demo

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DemoColors =
    darkColorScheme(
        background = Color.Black,
        surface = Color.Black,
        onBackground = Color.White,
        onSurface = Color.White,
        primary = Color.White,
        onPrimary = Color.Black,
        secondaryContainer = Color(0xFF2A2A2A),
        onSecondaryContainer = Color.White,
        outline = Color(0xFF666666),
    )

/** Pure-black Material theme matching the monochrome target display. */
@Composable
fun DemoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DemoColors, content = content)
}
