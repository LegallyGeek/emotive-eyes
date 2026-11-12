package com.legalgeeklabs.emotiveeyes.features.reportstatus

import com.legalgeeklabs.emotiveeyes.entities.StatusSpec
import com.legalgeeklabs.emotiveeyes.entities.Vec2

/** One monitored input; [direction] components are in `[-1, 1]`. */
public data class StatusInput(
    val id: String,
    val status: String,
    val direction: Vec2? = null,
)

/** The expression name to show and, if something changed, the direction to glance toward. */
public data class StatusResult(
    val expression: String,
    val glance: Vec2?,
)

/**
 * Derives an expression and optional glance from input statuses. The first [update] is a baseline
 * and never glances.
 */
public class StatusTracker(
    private val spec: StatusSpec,
) {
    private val rank = spec.severity.withIndex().associate { (i, name) -> name to i }
    private var previous: Map<String, String>? = null

    private fun validate(inputs: List<StatusInput>) {
        val seen = HashSet<String>()
        for (input in inputs) {
            require(input.status in rank) { "Unknown status \"${input.status}\" for input \"${input.id}\"" }
            require(seen.add(input.id)) { "Duplicate input id \"${input.id}\"" }
        }
    }

    // Strict `>` keeps the first of equally severe inputs.
    private fun mostSevere(list: List<StatusInput>): StatusInput =
        list.reduce { best, input -> if (rank.getValue(input.status) > rank.getValue(best.status)) input else best }

    /**
     * Ingests the current inputs.
     *
     * @throws IllegalArgumentException for an unknown status or a duplicate id
     */
    public fun update(inputs: List<StatusInput>): StatusResult {
        validate(inputs)
        val expression =
            if (inputs.isEmpty()) spec.emptyExpression else spec.expressionFor.getValue(mostSevere(inputs).status)

        var glance: Vec2? = null
        val prev = previous
        if (prev != null) {
            val changed = inputs.filter { prev[it.id] != it.status }
            if (changed.isNotEmpty()) glance = mostSevere(changed).direction
        }
        previous = inputs.associate { it.id to it.status }
        return StatusResult(expression, glance)
    }
}
