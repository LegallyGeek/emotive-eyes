package com.legalgeeklabs.emotiveeyes.drivers.compose

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import com.legalgeeklabs.emotiveeyes.entities.EyeGeometry
import com.legalgeeklabs.emotiveeyes.entities.FaceGeometry
import com.legalgeeklabs.emotiveeyes.entities.Layout
import com.legalgeeklabs.emotiveeyes.entities.Point
import kotlin.math.min

private fun Path.moveTo(p: Point) = moveTo(p.x.toFloat(), p.y.toFloat())

private fun Path.lineTo(p: Point) = lineTo(p.x.toFloat(), p.y.toFloat())

private fun eyePath(g: EyeGeometry): Path {
    val e = g.eye
    val r = CornerRadius(e.radius.toFloat())
    val body =
        Path().apply {
            addRoundRect(
                RoundRect(e.left.toFloat(), e.top.toFloat(), e.right.toFloat(), e.bottom.toFloat(), r, r, r, r),
            )
        }
    val upper =
        Path().apply {
            moveTo(g.upperLid[0])
            for (i in 1 until g.upperLid.size) lineTo(g.upperLid[i])
            close()
        }
    val low = g.lowerLid
    val lower =
        Path().apply {
            moveTo(low.start)
            lineTo(low.edgeLeft)
            quadraticTo(
                low.control.x.toFloat(),
                low.control.y.toFloat(),
                low.edgeRight.x.toFloat(),
                low.edgeRight.y.toFloat(),
            )
            lineTo(low.end)
            close()
        }
    val lids = Path.combine(PathOperation.Union, upper, lower)
    return Path.combine(PathOperation.Difference, body, lids)
}

/** Draws both eyes, scaled uniformly from face units to fit the canvas and centred. */
internal fun DrawScope.drawFace(
    geometry: FaceGeometry,
    layout: Layout,
    color: Color,
) {
    val s = min(size.width / layout.width.toFloat(), size.height / layout.height.toFloat())
    val dx = (size.width - layout.width.toFloat() * s) / 2
    val dy = (size.height - layout.height.toFloat() * s) / 2
    translate(dx, dy) {
        scale(s, s, pivot = Offset.Zero) {
            // Line-merge blinks from wide presets extend past the face; the contract clips to its rectangle.
            clipRect(0f, 0f, layout.width.toFloat(), layout.height.toFloat()) {
                drawPath(eyePath(geometry.left), color)
                drawPath(eyePath(geometry.right), color)
            }
        }
    }
}
