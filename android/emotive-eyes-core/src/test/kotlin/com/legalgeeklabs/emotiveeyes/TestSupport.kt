package com.legalgeeklabs.emotiveeyes

import com.legalgeeklabs.emotiveeyes.entities.EyeParams
import com.legalgeeklabs.emotiveeyes.entities.Point
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Absolute tolerance shared with the JS reference; only `tan` may differ in the last ULP. */
const val TOLERANCE = 1e-9

private val specDir = File(checkNotNull(System.getProperty("emotiveeyes.specDir")) { "emotiveeyes.specDir unset" })

fun specText(relative: String): String = File(specDir, relative).readText()

fun specJson(relative: String): JsonObject = Json.parseToJsonElement(specText(relative)) as JsonObject

fun JsonElement.obj(): JsonObject = this as JsonObject

fun JsonElement.arr(): JsonArray = this as JsonArray

fun JsonElement.num(): Double = (this as JsonPrimitive).double

fun JsonElement.str(): String = (this as JsonPrimitive).content

fun JsonElement.bool(): Boolean = (this as JsonPrimitive).content.toBooleanStrict()

fun JsonObject.getValue(key: String): JsonElement = checkNotNull(this[key]) { "missing key $key" }

fun eyeParams(o: JsonObject): EyeParams = EyeParams.fromList(EyeParams.KEYS.map { o.getValue(it).num() })

fun point(e: JsonElement): Point = Point(e.arr()[0].num(), e.arr()[1].num())

fun assertClose(
    expected: Double,
    actual: Double,
    message: String,
) {
    assertTrue(kotlin.math.abs(expected - actual) <= TOLERANCE, "$message: expected $expected, got $actual")
}

fun assertCloseOrNull(
    expected: JsonElement,
    actual: Double,
    message: String,
) {
    if (expected is JsonNull) {
        assertEquals(Double.POSITIVE_INFINITY, actual, message)
    } else {
        assertClose(expected.num(), actual, message)
    }
}

fun assertEyeParamsClose(
    expected: EyeParams,
    actual: EyeParams,
    message: String,
) {
    EyeParams.KEYS.forEachIndexed { i, key ->
        assertClose(expected.toList()[i], actual.toList()[i], "$message.$key")
    }
}
