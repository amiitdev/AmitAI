package com.amit.ai

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Tools AmitAI exposes to the opencode agent over MCP (all local). */
object McpTools {

    private fun tool(name: String, desc: String, props: JSONObject, required: JSONArray) =
        JSONObject()
            .put("name", name)
            .put("description", desc)
            .put(
                "inputSchema",
                JSONObject()
                    .put("type", "object")
                    .put("properties", props)
                    .put("required", required),
            )

    fun list(): JSONArray {
        val text = JSONObject().put("type", "string")
        val out = JSONArray()
        out.put(tool("remember", "Save a durable note on the user's phone (the user said 'remember …').", JSONObject().put("text", text), JSONArray().put("text")))
        out.put(tool("recall", "Search notes saved on this phone. Empty query = recent notes.", JSONObject().put("query", text), JSONArray()))
        out.put(tool("search_chats", "Search the user's earlier AmitAI conversations.", JSONObject().put("query", text), JSONArray().put("query")))
        out.put(tool("get_weather", "Current weather for a city (Open-Meteo, no key).", JSONObject().put("query", text), JSONArray().put("query")))
        out.put(tool("get_time", "Current date and time. Optional IANA timezone like Asia/Kolkata.", JSONObject().put("timezone", text), JSONArray()))
        return out
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("amitai", Context.MODE_PRIVATE)
    private const val NOTES = "amitai:memory:v1"
    private fun fold(s: String) = s.lowercase().replace(Regex("[^a-z0-9]+"), "")

    fun call(ctx: Context, name: String, args: JSONObject): String = when (name) {
        "remember" -> remember(ctx, args.optString("text"))
        "recall" -> recall(ctx, args.optString("query"))
        "search_chats" -> searchChats(ctx, args.optString("query"))
        "get_weather" -> weather(args.optString("query"))
        "get_time" -> clock(args.optString("timezone"))
        else -> throw IllegalArgumentException("unknown tool $name")
    }

    private fun notes(ctx: Context): JSONArray {
        val raw = prefs(ctx).getString(NOTES, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (_: Throwable) { JSONArray() }
    }

    private fun remember(ctx: Context, text: String): String {
        val clean = text.replace(Regex("\\s+"), " ").trim()
        if (clean.length < 3) throw IllegalArgumentException("nothing to remember")
        val arr = notes(ctx)
        val key = fold(clean)
        val now = System.currentTimeMillis()
        for (i in 0 until arr.length()) {
            val n = arr.optJSONObject(i) ?: continue
            if (fold(n.optString("text")) == key) {
                n.put("updatedAt", now)
                prefs(ctx).edit().putString(NOTES, arr.toString()).commit()
                return "Saved to memory: ${n.optString("text")}"
            }
        }
        arr.put(
            JSONObject().put("id", UUID.randomUUID().toString().take(10))
                .put("text", clean).put("createdAt", now).put("updatedAt", now),
        )
        prefs(ctx).edit().putString(NOTES, arr.toString()).commit()
        return "Saved to memory: $clean"
    }

    private fun recall(ctx: Context, query: String): String {
        val arr = notes(ctx)
        val words = query.lowercase().split(Regex("[^a-z0-9]+")).filter { it.length > 2 }
        val hits = mutableListOf<Pair<Int, String>>()
        for (i in 0 until arr.length()) {
            val n = arr.optJSONObject(i) ?: continue
            val text = n.optString("text")
            val hay = fold(text)
            var score = 0
            for (w in words) if (hay.contains(fold(w))) score++
            if (words.isEmpty() || score > 0) hits.add(score to text)
        }
        if (hits.isEmpty()) return "No saved memory matched \"$query\"."
        return hits.sortedByDescending { it.first }.take(8).joinToString("\n") { "- ${it.second}" }
    }

    private fun conversations(ctx: Context): JSONArray {
        prefs(ctx).getString("amitai:conversations:v1", null)?.let {
            try { return JSONArray(it) } catch (_: Throwable) {}
        }
        val dirs = listOfNotNull(
            java.io.File(ctx.getExternalFilesDir(null), "AmitAI"),
            java.io.File("/storage/emulated/0/AmitAI"),
        )
        for (d in dirs) {
            val f = java.io.File(d, "conversations.json")
            if (f.exists()) try { return JSONArray(f.readText()) } catch (_: Throwable) {}
        }
        return JSONArray()
    }

    private fun searchChats(ctx: Context, query: String): String {
        val words = query.lowercase().split(Regex("[^a-z0-9]+")).filter { it.length > 2 }
        if (words.isEmpty()) return "Give me a word to search for."
        val hits = mutableListOf<Triple<Int, String, String>>()
        val arr = conversations(ctx)
        for (i in 0 until arr.length()) {
            val c = arr.optJSONObject(i) ?: continue
            val title = c.optString("title")
            val msgs = c.optJSONArray("messages") ?: continue
            for (j in 0 until msgs.length()) {
                val m = msgs.optJSONObject(j) ?: continue
                val text = m.optString("content")
                if (text.length < 6) continue
                val hay = fold(text)
                var score = 0
                for (w in words) if (hay.contains(fold(w))) score++
                if (score > 0) {
                    hits.add(Triple(score, title, text.replace(Regex("\\s+"), " ").take(300)))
                }
            }
        }
        if (hits.isEmpty()) return "No earlier conversation matched \"$query\"."
        return hits.sortedByDescending { it.first }.take(6)
            .joinToString("\n") { "- [${it.second}] ${it.third}" }
    }

    private fun getJson(url: String): JSONObject {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("User-Agent", "AmitAI/3.9")
        }
        return conn.inputStream.bufferedReader().use { JSONObject(it.readText()) }
    }

    private fun weather(query: String): String {
        if (query.isBlank()) throw IllegalArgumentException("weather needs a place name")
        val q = java.net.URLEncoder.encode(query, "UTF-8")
        val geo = getJson("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=$q")
        val place = geo.optJSONArray("results")?.optJSONObject(0)
            ?: return "No place called \"$query\"."
        val name = place.optString("name") + ", " + place.optString("country")
        val lat = place.optDouble("latitude")
        val lon = place.optDouble("longitude")
        val w = getJson(
            "https://api.open-meteo.com/v1/forecast?current=temperature_2m,relative_humidity_2m," +
                "apparent_temperature,weather_code,wind_speed_10m&latitude=$lat&longitude=$lon",
        )
        val cur = w.optJSONObject("current") ?: return "Weather unavailable for $name."
        return "$name: ${cur.optDouble("temperature_2m")}°C " +
            "(feels ${cur.optDouble("apparent_temperature")}°C), humidity " +
            "${cur.optInt("relative_humidity_2m")}%, wind ${cur.optDouble("wind_speed_10m")} km/h, " +
            "code ${cur.optInt("weather_code")}."
    }

    private fun clock(tz: String): String {
        val zone = if (tz.isBlank()) TimeZone.getDefault() else TimeZone.getTimeZone(tz)
        val fmt = java.text.SimpleDateFormat("EEE, d MMM yyyy HH:mm", Locale.US)
        fmt.timeZone = zone
        return "${fmt.format(Date())} (${zone.getDisplayName(false, TimeZone.SHORT)})"
    }
}
