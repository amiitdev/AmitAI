package com.amit.ai

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors

/**
 * MCP server for the local opencode agent.
 *
 * The AmitAI Bridge forwards one text prompt to opencode, which cannot accept
 * client-side tool definitions. What opencode *can* do is connect to MCP
 * servers, so the app exposes its own tools at http://127.0.0.1:8140/mcp and
 * opencode.json registers that URL. The agent then calls remember/recall/
 * search_chats/get_weather/get_time itself, inside this app's process, and the
 * bridge stays untouched.
 */
object AmitMcpServer {
    private const val TAG = "AmitMcp"
    const val PORT = 8140
    const val TOKEN_KEY = "mcp_token"

    @Volatile
    var running = false
        private set

    private var server: ServerSocket? = null
    private val pool = Executors.newFixedThreadPool(4)

    fun token(ctx: Context): String {
        val prefs = ctx.getSharedPreferences("amitai", Context.MODE_PRIVATE)
        val existing = prefs.getString(TOKEN_KEY, null)
        if (!existing.isNullOrBlank()) return existing
        val fresh = UUID.randomUUID().toString().replace("-", "")
        prefs.edit().putString(TOKEN_KEY, fresh).commit()
        return fresh
    }

    @Synchronized
    fun start(ctx: Context) {
        if (running) return
        val app = ctx.applicationContext
        val bound = try {
            ServerSocket(PORT, 20, InetAddress.getByName("127.0.0.1"))
        } catch (e: Throwable) {
            // Right after an app update the old process may still be releasing
            // the port. Retry briefly instead of giving up for the whole session,
            // which would leave the agent with a dead endpoint.
            Log.w(TAG, "bind failed on 127.0.0.1:$PORT — retrying", e)
            Thread {
                repeat(5) {
                    SystemClock.sleep(1500)
                    start(app)
                    if (running) return@Thread
                }
                Log.e(TAG, "gave up on port $PORT; MCP endpoint unavailable")
            }.apply { isDaemon = true }.start()
            return
        }
        server = bound
        running = true
        Log.i(TAG, "listening on 127.0.0.1:$PORT")
        Thread {
            while (running) {
                val sock = try {
                    server?.accept() ?: break
                } catch (_: Throwable) {
                    break
                }
                pool.execute { handle(app, sock) }
            }
        }.apply { isDaemon = true }.start()
    }

    /** Closes the listening socket; in-flight requests finish on their own. */
    @Synchronized
    fun stop() {
        running = false
        try {
            server?.close()
        } catch (_: Throwable) {
        }
        server = null
    }

    fun status(ctx: Context): JSONObject = JSONObject()
        .put("url", "http://127.0.0.1:$PORT/mcp")
        .put("token", token(ctx))
        .put("running", running)
        .put("service", McpService.running)

    private fun handle(ctx: Context, sock: Socket) {
        try {
            sock.soTimeout = 10_000
            val reader = BufferedReader(InputStreamReader(sock.getInputStream(), Charsets.UTF_8))
            val line = reader.readLine() ?: return
            val parts = line.split(" ")
            if (parts.size < 2) return
            var length = 0
            var auth = ""
            while (true) {
                val h = reader.readLine() ?: break
                if (h.isEmpty()) break
                val l = h.lowercase()
                if (l.startsWith("content-length:")) length = h.substringAfter(':').trim().toIntOrNull() ?: 0
                if (l.startsWith("authorization:")) auth = h.substringAfter(':').trim()
            }
            val path = parts[1].substringBefore('?')
            if (path == "/health") return respond(sock, 200, "{\"ok\":true}")
            if (auth != "Bearer " + token(ctx)) return respond(sock, 401, "{\"unauthenticated\":true}")
            if (parts[0] != "POST") return respond(sock, 405, "{}")

            val buf = CharArray(length)
            var read = 0
            while (read < length) {
                val n = reader.read(buf, read, length - read)
                if (n < 0) break
                read += n
            }
            val req = JSONObject(String(buf, 0, read))
            val id = req.opt("id")
            when (val method = req.optString("method")) {
                "initialize" -> reply(sock, id, JSONObject()
                    .put("protocolVersion", "2024-11-05")
                    .put("capabilities", JSONObject().put("tools", JSONObject()))
                    .put("serverInfo", JSONObject().put("name", "amitai-tools").put("version", "1.0.0")))
                "notifications/initialized", "notifications/cancelled" -> respond(sock, 202, "")
                "ping" -> reply(sock, id, JSONObject())
                "tools/list" -> reply(sock, id, JSONObject().put("tools", McpTools.list()))
                "tools/call" -> callTool(ctx, sock, id, req)
                else -> replyError(sock, id, -32601, "unknown method $method")
            }
        } catch (_: Throwable) {
        } finally {
            try { sock.close() } catch (_: Throwable) {}
        }
    }

    private fun callTool(ctx: Context, sock: Socket, id: Any?, req: JSONObject) {
        val p = req.optJSONObject("params") ?: JSONObject()
        val name = p.optString("name")
        val args = p.optJSONObject("arguments") ?: JSONObject()
        val content = JSONArray()
        try {
            content.put(JSONObject().put("type", "text").put("text", McpTools.call(ctx, name, args)))
            reply(sock, id, JSONObject().put("content", content))
        } catch (e: Throwable) {
            content.put(JSONObject().put("type", "text").put("text", "Error: ${e.message ?: name}"))
            reply(sock, id, JSONObject().put("content", content).put("isError", true))
        }
    }

    private fun reply(sock: Socket, id: Any?, result: JSONObject) {
        val out = JSONObject().put("jsonrpc", "2.0").put("result", result)
        out.put("id", id ?: JSONObject.NULL)
        respond(sock, 200, out.toString())
    }

    private fun replyError(sock: Socket, id: Any?, code: Int, message: String) {
        val out = JSONObject().put("jsonrpc", "2.0").put("id", id ?: JSONObject.NULL)
            .put("error", JSONObject().put("code", code).put("message", message))
        respond(sock, 200, out.toString())
    }

    private fun respond(sock: Socket, code: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $code OK\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            "Connection: close\r\n\r\n"
        val out: OutputStream = sock.getOutputStream()
        out.write(head.toByteArray(Charsets.UTF_8))
        out.write(bytes)
        out.flush()
    }
}
