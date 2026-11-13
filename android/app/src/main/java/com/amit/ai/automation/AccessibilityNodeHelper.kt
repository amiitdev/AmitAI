package com.amit.ai.automation

import android.graphics.Rect
import android.os.Build
import android.text.InputType
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.IdentityHashMap
import java.util.Locale

/**
 * Reading the screen without looking at it.
 *
 * Everything the automation engine knows comes from the accessibility tree:
 * text, content descriptions, classes, bounds, and whether something is
 * clickable/editable/scrollable. That is structured data — no screenshots, no
 * coordinates guessed by eye.
 *
 * Two rules keep this file honest:
 *
 *  - Nodes are never stored anywhere. Each call fetches a fresh root, copies
 *    what it needs into plain Kotlin values, and releases the tree. A cached
 *    AccessibilityNodeInfo is stale the instant the UI redraws.
 *  - Recycling happens only below API 33. From 33 onwards `recycle()` is a
 *    deprecated no-op and calling it is worse than not: the system owns the
 *    lifetime. Below 33 we recycle every node we obtained, exactly once, in a
 *    `finally`, so a long session cannot leak the view hierarchy.
 */
object AccessibilityNodeHelper {

    private const val MAX_NODES = 1600
    private const val MAX_DEPTH = 40

    /** A node flattened into values — safe to keep after the tree is released. */
    data class UiNode(
        val text: String,
        val description: String,
        val className: String,
        val viewId: String,
        val clickable: Boolean,
        val editable: Boolean,
        val scrollable: Boolean,
        val password: Boolean,
        val checkable: Boolean,
        val checked: Boolean,
        val selected: Boolean,
        val enabled: Boolean,
        val visible: Boolean,
        val bounds: Rect,
        val hint: String,
    ) {
        val label: String
            get() = text.ifBlank { description }.ifBlank { viewId.substringAfterLast('/') }

        fun toJson(): JSONObject = JSONObject().apply {
            put("text", text)
            put("description", description)
            put("class", className.substringAfterLast('.'))
            put("view_id", viewId)
            put("clickable", clickable)
            put("editable", editable)
            put("scrollable", scrollable)
            put("password", password)
            put("checkable", checkable)
            put("checked", checked)
            put("selected", selected)
            put("enabled", enabled)
            put("bounds", JSONObject().put("l", bounds.left).put("t", bounds.top)
                .put("r", bounds.right).put("b", bounds.bottom))
        }
    }

    /** The tree, flattened, plus the aggregate facts the policy needs. */
    data class Tree(
        val nodes: List<UiNode>,
        val digest: String,
        val hasPassword: Boolean,
        val windowTitle: String,
        val packageName: String,
        val nodeCount: Int,
    )

    /* ------------------------------ tree walking --------------------------- */

    /**
     * Walk the active window once. Returns null when the window is not readable
     * (secure window, permission dialog, or the service lost its root) which is
     * reported to the agent as "screen not readable" rather than as an empty
     * screen it might mistake for "nothing there".
     */
    fun read(service: AmitAccessibilityService, maxNodes: Int = MAX_NODES): Tree? {
        val root = service.rootInActiveWindow ?: return null
        val owned = ArrayList<AccessibilityNodeInfo>(64)
        try {
            val nodes = ArrayList<UiNode>(48)
            val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
            val seen = IdentityHashMap<AccessibilityNodeInfo, Boolean>()
            queue.add(root to 0)
            var totalNodes = 0
            var digest = 0xcbf29ce484222325uL.toLong()
            var hasPassword = false
            var windowTitle = ""

            while (queue.isNotEmpty() && totalNodes < maxNodes) {
                val (node, depth) = queue.removeFirst()
                if (seen.put(node, true) != null) continue
                owned.add(node)
                totalNodes++
                if (depth == 0) {
                    windowTitle = text(node).ifBlank { node.contentDescription?.toString() ?: "" }
                }
                if (node.isPassword) hasPassword = true

                val bounds = Rect().also { node.getBoundsInScreen(it) }
                val visible = node.isVisibleToUser && !bounds.isEmpty
                if (visible) {
                    val ui = UiNode(
                        text = text(node),
                        description = (node.contentDescription?.toString() ?: "").trim(),
                        className = node.className?.toString() ?: "",
                        viewId = node.viewIdResourceName ?: "",
                        clickable = node.isClickable ||
                            node.actionList.any { it.id == AccessibilityNodeInfo.ACTION_CLICK },
                        editable = isEditable(node),
                        scrollable = node.isScrollable,
                        password = node.isPassword,
                        checkable = node.isCheckable,
                        checked = node.isChecked,
                        selected = node.isSelected,
                        enabled = node.isEnabled,
                        visible = true,
                        bounds = bounds,
                        hint = if (Build.VERSION.SDK_INT >= 26)
                            (node.hintText?.toString() ?: "") else "",
                    )
                    if (ui.text.isNotBlank() || ui.description.isNotBlank() || ui.editable) {
                        nodes.add(ui)
                    }
                    // Stable screen fingerprint: what a human would see, not pixels.
                    // Icon-only buttons have no text, so the class, the clickable
                    // flag and the bounds still have to be part of the hash —
                    // otherwise a screen full of icons would look unchanged.
                    val street = "${ui.text}|${ui.description}|${ui.className}|${ui.clickable}|" +
                        "${ui.bounds.left},${ui.bounds.top},${ui.bounds.right},${ui.bounds.bottom}"
                    for (ch in street) {
                        digest = digest xor ch.code.toLong()
                        digest *= 0x100000001b3L
                    }
                }

                if (depth < MAX_DEPTH && node.childCount > 0) {
                    for (i in 0 until node.childCount) {
                        val child = node.getChild(i) ?: continue
                        queue.add(child to depth + 1)
                    }
                }
            }

            return Tree(
                nodes = nodes,
                digest = java.lang.Long.toHexString(digest),
                hasPassword = hasPassword,
                windowTitle = windowTitle.trim().take(120),
                packageName = root.packageName?.toString() ?: "",
                nodeCount = totalNodes,
            )
        } finally {
            // `root` is already in `owned`; recycling it twice would be a no-op
            // on API 33+ and a caught exception below it.
            recycle(owned)
        }
    }

    /* --------------------------------- search ------------------------------ */

    fun norm(s: String?): String =
        (s ?: "").lowercase(Locale.ROOT).replace(Regex("\\s+"), " ").trim()

    private fun score(node: AccessibilityNodeInfo, text: String?, desc: String?): Int {
        val t = norm(text)
        val d = norm(desc)
        val nodeText = norm(node.text?.toString())
        val nodeDesc = norm(node.contentDescription?.toString())
        val nodeHint = norm(if (Build.VERSION.SDK_INT >= 26) node.hintText?.toString() else null)
        val nodeId = norm(node.viewIdResourceName?.substringAfterLast('/'))

        var s = 0
        if (t.isNotEmpty()) {
            s += when {
                nodeText == t -> 100
                // A prefix or a substring match is weaker the more extra words
                // it drags in: "Search" must beat "Voice search".
                nodeText.startsWith(t) -> 86 - minOf(18, nodeText.length - t.length)
                nodeText.contains(t) -> 62 - minOf(14, nodeText.length - t.length)
                nodeHint == t -> 60
                nodeHint.contains(t) -> 45
                // Resource ids are real labels too ("search", "menu", "send").
                nodeId == t -> 88
                nodeId.startsWith(t) -> 70 - minOf(14, nodeId.length - t.length)
                nodeId.contains(t) -> 48 - minOf(12, nodeId.length - t.length)
                else -> 0
            }
        }
        if (d.isNotEmpty()) {
            s += when {
                nodeDesc == d -> 96
                nodeDesc.startsWith(d) -> 86 - minOf(18, nodeDesc.length - d.length)
                nodeDesc.contains(d) -> 58 - minOf(14, nodeDesc.length - d.length)
                else -> 0
            }
        }
        if (s == 0) return 0
        if (node.isClickable) s += 12
        if (node.isEnabled) s += 4
        return s
    }

    /** Matching nodes, best first. Caller recycles. */
    fun findAll(
        root: AccessibilityNodeInfo,
        text: String?,
        desc: String?,
        limit: Int = 8,
    ): List<AccessibilityNodeInfo> {
        val out = ArrayList<Pair<AccessibilityNodeInfo, Int>>(8)
        val owned = ArrayList<AccessibilityNodeInfo>(32)
        val seen = IdentityHashMap<AccessibilityNodeInfo, Boolean>()
        val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        queue.add(root to 0)
        var visited = 0
        try {
            while (queue.isNotEmpty() && visited < MAX_NODES) {
                val (node, depth) = queue.removeFirst()
                if (seen.put(node, true) != null) continue
                owned.add(node)
                visited++
                val s = score(node, text, desc)
                if (s > 0 && node.isVisibleToUser) out.add(node to s)
                if (depth < MAX_DEPTH && node.childCount > 0) {
                    for (i in 0 until node.childCount) {
                        val child = node.getChild(i) ?: continue
                        queue.add(child to depth + 1)
                    }
                }
            }
            out.sortByDescending { it.second }
            val winners = out.take(limit).map { it.first }
            // Everything that matched but did not win is released here; the
            // winners are released by the caller after the action is performed.
            val keep = IdentityHashMap<AccessibilityNodeInfo, Boolean>()
            winners.forEach { keep[it] = true }
            recycle(owned.filter { !keep.containsKey(it) })
            return winners
        } catch (e: Throwable) {
            recycle(owned)
            throw e
        }
    }

    /** The clickable ancestor of a matched node (labels are often inside a button). */
    fun clickableAncestor(node: AccessibilityNodeInfo, maxUp: Int = 8): AccessibilityNodeInfo? {
        var cur: AccessibilityNodeInfo? = node
        val walked = ArrayList<AccessibilityNodeInfo>(8)
        var up = 0
        var winner: AccessibilityNodeInfo? = null
        while (cur != null && up <= maxUp) {
            if (cur.isEnabled &&
                (cur.isClickable || cur.actionList.any { it.id == AccessibilityNodeInfo.ACTION_CLICK })
            ) {
                winner = cur
                break
            }
            val parent = cur.parent ?: break
            if (parent !== node) walked.add(parent)
            cur = parent
            up++
        }
        // The caller owns `node` and the winner; everything in between is ours.
        recycle(walked.filter { it !== winner })
        return winner
    }

    /** Visible clickable elements, in reading order (top-to-bottom). */
    fun clickables(tree: Tree, limit: Int = 40): List<UiNode> =
        tree.nodes
            .filter { it.clickable && it.visible && it.enabled && !it.password }
            .sortedWith(compareBy({ it.bounds.top }, { it.bounds.left }))
            .take(limit)

    fun scrollable(tree: Tree): UiNode? =
        tree.nodes.filter { it.scrollable && it.visible }.maxByOrNull {
            it.bounds.width().toLong() * it.bounds.height().toLong()
        }

    fun editableNodes(tree: Tree): List<UiNode> =
        tree.nodes.filter { it.editable && it.visible && it.enabled }

    /**
     * Find a node, use it, release it — all inside one call.
     *
     * Holding the root for the whole block is what makes this safe below API
     * 33: a child node object stays usable only while its window connection is
     * alive, so the tree is released *after* the tap/type, never before.
     */
    fun <T> withNode(
        service: AmitAccessibilityService,
        text: String?,
        desc: String?,
        requireClickable: Boolean = false,
        block: (AccessibilityNodeInfo) -> T,
    ): T? {
        val root = service.rootInActiveWindow ?: return null
        var matches: List<AccessibilityNodeInfo> = emptyList()
        try {
            matches = findAll(root, text, desc, 12)
            if (matches.isEmpty()) return null
            var chosen: AccessibilityNodeInfo? = null
            for (m in matches) {
                val target = if (requireClickable) clickableAncestor(m) else m
                if (target != null) {
                    chosen = target
                    break
                }
            }
            if (chosen == null) return null
            return block(chosen)
        } finally {
            recycle(matches)
            recycle(listOf(root))
        }
    }

    /** Same contract as withNode, for the editable field the keyboard is on. */
    fun <T> withEditableNode(
        service: AmitAccessibilityService,
        block: (AccessibilityNodeInfo) -> T,
    ): T? {
        val root = service.rootInActiveWindow ?: return null
        val owned = ArrayList<AccessibilityNodeInfo>(4)
        try {
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (focused != null) {
                owned.add(focused)
                if (focused.isVisibleToUser && focused.isEnabled && isEditable(focused)) {
                    return block(focused)
                }
            }
            val queue = ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var visited = 0
            while (queue.isNotEmpty() && visited < MAX_NODES) {
                val node = queue.removeFirst()
                if (node !== root && node !== focused) owned.add(node)
                visited++
                if (node.isVisibleToUser && node.isEnabled && isEditable(node)) {
                    return block(node)
                }
                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { queue.add(it) }
                }
            }
            return null
        } finally {
            recycle(owned)
            recycle(listOf(root))
        }
    }

    /** Same contract as withNode, for the biggest visible scrollable container. */
    fun <T> withScrollableNode(
        service: AmitAccessibilityService,
        block: (AccessibilityNodeInfo) -> T,
    ): T? {
        val root = service.rootInActiveWindow ?: return null
        val owned = ArrayList<AccessibilityNodeInfo>(8)
        try {
            val queue = ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var best: AccessibilityNodeInfo? = null
            var bestArea = -1L
            var visited = 0
            while (queue.isNotEmpty() && visited < MAX_NODES) {
                val node = queue.removeFirst()
                if (node !== root) owned.add(node)
                visited++
                if (node.isVisibleToUser && node.isScrollable) {
                    val r = Rect().also { node.getBoundsInScreen(it) }
                    val area = r.width().toLong() * r.height().toLong()
                    if (area > bestArea) {
                        best = node
                        bestArea = area
                    }
                }
                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { queue.add(it) }
                }
            }
            val target = best ?: return null
            return block(target)
        } finally {
            recycle(owned)
            recycle(listOf(root))
        }
    }

    /* --------------------------------- utils ------------------------------- */
    fun isEditable(node: AccessibilityNodeInfo): Boolean {
        if (node.isEditable) return true
        val cls = node.className?.toString() ?: ""
        if (cls.endsWith("EditText") || cls.endsWith("AutoCompleteTextView")) return true
        val type = try {
            node.inputType
        } catch (_: Throwable) {
            0
        }
        return (type and InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_TEXT &&
            (type and InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0 && cls.contains("Edit", true)
    }

    fun text(node: AccessibilityNodeInfo): String =
        (node.text?.toString() ?: "").trim()

    /** One-line description of a node for results and history. */
    fun describe(node: AccessibilityNodeInfo): JSONObject {
        val r = Rect().also { node.getBoundsInScreen(it) }
        return JSONObject().apply {
            put("text", text(node))
            put("description", node.contentDescription?.toString() ?: "")
            put("class", node.className?.toString()?.substringAfterLast('.') ?: "")
            put("view_id", node.viewIdResourceName ?: "")
            put("clickable", node.isClickable)
            put("editable", isEditable(node))
            put("password", node.isPassword)
            put("enabled", node.isEnabled)
            put("bounds", JSONObject().put("l", r.left).put("t", r.top)
                .put("r", r.right).put("b", r.bottom))
        }
    }

    fun nodesToJson(nodes: List<UiNode>): JSONArray {
        val arr = JSONArray()
        nodes.forEach { arr.put(it.toJson()) }
        return arr
    }

    fun appendTexts(nodes: List<UiNode>, out: JSONArray, charsBudget: Int = 6000) {
        var used = 0
        for (n in nodes) {
            val line = n.label
            if (line.isBlank()) continue
            if (used + line.length > charsBudget) break
            used += line.length
            out.put(
                JSONObject()
                    .put("text", line)
                    .put("clickable", n.clickable)
                    .put("editable", n.editable)
                    .put("bounds", JSONObject().put("l", n.bounds.left).put("t", n.bounds.top)
                        .put("r", n.bounds.right).put("b", n.bounds.bottom)),
            )
        }
    }

    fun recycle(nodes: Collection<AccessibilityNodeInfo?>) {
        if (Build.VERSION.SDK_INT >= 33) return
        val seen = IdentityHashMap<AccessibilityNodeInfo, Boolean>()
        for (n in nodes) {
            if (n == null) continue
            if (seen.put(n, true) != null) continue
            try {
                n.recycle()
            } catch (_: Throwable) {
                // Already recycled / detached; nothing to do.
            }
        }
    }

    fun releaseExcept(nodes: List<AccessibilityNodeInfo>, keep: AccessibilityNodeInfo?) {
        recycle(nodes.filter { it !== keep })
    }
}
