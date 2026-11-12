package com.legalgeeklabs.emotiveeyes.entities

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.tan

/** A point in face units (origin top-left, y down). */
public data class Point(
    val x: Double,
    val y: Double,
)

/** Position of one eye's centre in face units. */
public data class EyeAnchor(
    val x: Double,
    val y: Double,
)

/** Logical face space and eye placement (face.json `layout`). */
public data class Layout(
    val width: Double,
    val height: Double,
    val eyeWidth: Double,
    val eyeHeight: Double,
    val lidOverscan: Double,
    val leftEye: EyeAnchor,
    val rightEye: EyeAnchor,
) {
    /** The anchor of [side]. */
    public fun anchor(side: Side): EyeAnchor = if (side == Side.LEFT) leftEye else rightEye
}

/** The eye's rounded rectangle before lids are cut out. */
public data class EyeRect(
    val left: Double,
    val top: Double,
    val right: Double,
    val bottom: Double,
    val radius: Double,
)

/** Lower-lid outline: start, a line to [edgeLeft], a quad via [control] to [edgeRight], then [end]. */
public data class LowerLid(
    val start: Point,
    val edgeLeft: Point,
    val control: Point,
    val edgeRight: Point,
    val end: Point,
)

/** Renderer-neutral geometry of one eye: visible eye = [eye] minus ([upperLid] union [lowerLid]). */
public data class EyeGeometry(
    val eye: EyeRect,
    val upperLid: List<Point>,
    val lowerLid: LowerLid,
)

/** Geometry for both eyes. */
public data class FaceGeometry(
    val left: EyeGeometry,
    val right: EyeGeometry,
)

/** Computes geometry for one eye (face units); operation order follows spec/SPEC.md exactly. */
public fun computeEyeGeometry(
    params: EyeParams,
    layout: Layout,
    side: Side,
): EyeGeometry {
    val p = clampParams(params)
    val o = layout.lidOverscan
    val anchor = layout.anchor(side)
    val ew = layout.eyeWidth * p.scaleX
    val eh = layout.eyeHeight * p.scaleY
    val cx = anchor.x + p.offsetX * layout.eyeWidth
    val cy = anchor.y + p.offsetY * layout.eyeHeight
    val left = cx - ew / 2
    val top = cy - eh / 2
    val right = left + ew
    val bottom = top + eh
    val radius = minOf(minOf(eh * p.roundness, ew / 2), eh / 2)

    val sign = if (side == Side.RIGHT) -1.0 else 1.0
    val dropRight = tan((p.upperLidTilt * PI) / 180) * (ew / 2) * sign
    val lidY = top + eh * p.upperLid
    val polyTop = minOf(top, lidY - abs(dropRight)) - o

    val lowY = bottom - eh * p.lowerLid
    val controlY = lowY - eh * p.lowerLidBend
    val lidBottom = maxOf(bottom, controlY) + o

    return EyeGeometry(
        eye = EyeRect(left, top, right, bottom, radius),
        upperLid =
            listOf(
                Point(left - o, polyTop),
                Point(right + o, polyTop),
                Point(right + o, lidY + dropRight),
                Point(left - o, lidY - dropRight),
            ),
        lowerLid =
            LowerLid(
                start = Point(left - o, lidBottom),
                edgeLeft = Point(left - o, lowY),
                control = Point(cx, controlY),
                edgeRight = Point(right + o, lowY),
                end = Point(right + o, lidBottom),
            ),
    )
}

/** Computes geometry for both eyes. */
public fun computeFaceGeometry(
    params: FaceParams,
    layout: Layout,
): FaceGeometry =
    FaceGeometry(
        left = computeEyeGeometry(params.left, layout, Side.LEFT),
        right = computeEyeGeometry(params.right, layout, Side.RIGHT),
    )
